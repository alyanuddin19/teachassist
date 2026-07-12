import itertools
import re
from dataclasses import asdict, dataclass, field
from difflib import SequenceMatcher

from .config import confidence_label, get_mapping_config


NUMBER_WORDS = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
}

PHASE_ALIASES = {
    "early_term": {"first", "mid", "middle", "midterm", "mid term", "first term"},
    "final_term": {"final", "end", "endterm", "end term", "terminal", "final exam"},
}


@dataclass
class HeaderFeatures:
    original: str
    normalized: str
    compact: str
    tokens: list[str]
    token_set: set[str]
    assessment_type: str = ""
    phase: str = ""
    question_number: int | None = None
    assessment_number: int | None = None
    clo_number: int | None = None
    mode: str = ""
    field_kind: str = ""
    metric_role: str = ""
    numeric_values: set[int] = field(default_factory=set)


@dataclass
class MatchResult:
    source_column: str
    suggested_target_column: str | None
    confidence_score: float
    confidence_label: str
    matching_method: str
    status: str
    conflict: bool = False
    matching_reasons: list[str] = field(default_factory=list)
    source_tokens: dict = field(default_factory=dict)
    target_tokens: dict = field(default_factory=dict)
    alternatives: list[dict] = field(default_factory=list)


class ColumnMatchingService:
    def __init__(self, synonym_groups: list[list[str]] | None = None) -> None:
        self.config = get_mapping_config()
        self.abbreviations = self.config.get("abbreviations", {})
        self.synonym_groups = list(self.config.get("synonym_groups", [])) + list(synonym_groups or [])
        self.synonym_lookup = self._build_synonym_lookup()
        matching = self.config.get("matching", {})
        self.fuzzy_min = float(matching.get("fuzzy_min_score", 0.62))
        self.uncertain_score = float(matching.get("uncertain_score", 0.65))
        self.auto_score = float(matching.get("auto_score", 0.78))

    def normalize(self, value: str, expand_abbreviations: bool = True) -> str:
        text = str(value or "").strip().lower()
        text = re.sub(r"([a-z])(\d)", r"\1 \2", text)
        text = re.sub(r"(\d)([a-z])", r"\1 \2", text)
        text = re.sub(r"[_\-./]+", " ", text)
        text = re.sub(r"[^a-z0-9 ]+", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        raw_tokens = []
        for token in text.split():
            if token in NUMBER_WORDS:
                raw_tokens.append(str(NUMBER_WORDS[token]))
            elif token.isdigit():
                raw_tokens.append(str(int(token)))
            else:
                raw_tokens.append(token)
        tokens = [
            self._expand_token(token) if expand_abbreviations else token
            for token in raw_tokens
        ]
        return " ".join(tokens)

    def _expand_token(self, token: str) -> str:
        # "Q" is ambiguous in marksheets: it can mean quiz, question, or a term
        # question number. Keep it as-is and let the surrounding words decide.
        if token == "q":
            return token
        return self.abbreviations.get(token, token)

    def compact(self, value: str, expand_abbreviations: bool = True) -> str:
        return re.sub(r"\s+", "", self.normalize(value, expand_abbreviations))

    def extract_features(self, value: str) -> HeaderFeatures:
        normalized = self.normalize(value)
        compact = re.sub(r"\s+", "", normalized)
        tokens = normalized.split()
        token_set = set(tokens)
        features = HeaderFeatures(
            original=str(value or ""),
            normalized=normalized,
            compact=compact,
            tokens=tokens,
            token_set=token_set,
            numeric_values={int(item) for item in re.findall(r"\d+", normalized)},
        )
        features.field_kind = self.field_kind(value)
        features.metric_role = self._metric_role(normalized, token_set)
        features.mode = self._mode(token_set)
        features.clo_number = self._number_after(tokens, {"clo"})
        features.question_number = self._question_number(tokens)
        features.assessment_type = self._assessment_type(tokens, token_set)
        features.assessment_number = self._assessment_number(tokens, features.assessment_type)
        features.phase = self._phase(normalized, token_set)
        return features

    def _build_synonym_lookup(self) -> dict[str, str]:
        lookup: dict[str, str] = {}
        for group in self.synonym_groups:
            normalized = [self.normalize(item) for item in group if item]
            if not normalized:
                continue
            canonical = normalized[0]
            for item in normalized:
                lookup[item] = canonical
        return lookup

    def suggest(self, source_headers: list[dict], target_headers: list[dict]) -> list[dict]:
        source_features = [self.extract_features(header["name"]) for header in source_headers]
        target_features = [self.extract_features(header["name"]) for header in target_headers]
        scores: list[list[dict]] = [
            [self.score_pair(source, target) for target in target_features]
            for source in source_features
        ]
        assignments = self.global_assignment(scores)
        suggestions: list[MatchResult] = []

        for source_index, source in enumerate(source_features):
            target_index = assignments.get(source_index)
            alternatives = self.alternatives(scores[source_index], target_headers, target_index)
            if target_index is None:
                suggestions.append(self._result(
                    source.original,
                    None,
                    0,
                    "no-match",
                    "Unmapped",
                    matching_reasons=[],
                    source_tokens=self.feature_payload(source),
                    alternatives=alternatives,
                ))
                continue

            score = scores[source_index][target_index]
            target = target_features[target_index]
            if score["score"] < self.fuzzy_min:
                suggestions.append(self._result(
                    source.original,
                    None,
                    score["score"],
                    score["method"],
                    "Unmapped",
                    matching_reasons=score["reasons"],
                    source_tokens=self.feature_payload(source),
                    target_tokens=self.feature_payload(target),
                    alternatives=alternatives,
                ))
                continue

            status = "Mapped" if score["score"] >= self.auto_score else "Needs review"
            suggestions.append(self._result(
                source.original,
                target.original,
                score["score"],
                score["method"],
                status,
                matching_reasons=score["reasons"],
                source_tokens=self.feature_payload(source),
                target_tokens=self.feature_payload(target),
                alternatives=alternatives,
            ))

        return [asdict(result) for result in suggestions]

    def suggest_by_target(self, source_headers: list[dict], target_headers: list[dict]) -> list[dict]:
        source_features = [self.extract_features(header["name"]) for header in source_headers]
        target_features = [self.extract_features(header["name"]) for header in target_headers]
        if not source_features or not target_features:
            return []

        candidates: list[tuple[float, int, int, dict]] = []
        for target_index, target in enumerate(target_features):
            for source_index, source in enumerate(source_features):
                score = self.score_pair(source, target)
                if score["score"] >= self.fuzzy_min:
                    candidates.append((score["score"], target_index, source_index, score))

        candidates.sort(key=lambda item: (item[0], -item[1], -item[2]), reverse=True)
        used_sources: set[int] = set()
        used_targets: set[int] = set()
        chosen: list[tuple[int, int, dict]] = []
        for _, target_index, source_index, score in candidates:
            if source_index in used_sources or target_index in used_targets:
                continue
            used_sources.add(source_index)
            used_targets.add(target_index)
            chosen.append((source_index, target_index, score))

        suggestions: list[MatchResult] = []
        for source_index, target_index, score in sorted(chosen, key=lambda item: item[0]):
            source = source_features[source_index]
            target = target_features[target_index]
            alternatives = self.alternatives(
                [self.score_pair(source, current_target) for current_target in target_features],
                target_headers,
                target_index,
            )
            status = "Mapped" if score["score"] >= self.auto_score else "Needs review"
            suggestions.append(self._result(
                source.original,
                target.original,
                score["score"],
                score["method"],
                status,
                matching_reasons=score["reasons"],
                source_tokens=self.feature_payload(source),
                target_tokens=self.feature_payload(target),
                alternatives=alternatives,
            ))

        for source_index, source in enumerate(source_features):
            if source_index in used_sources:
                continue
            suggestions.append(self._result(
                source.original,
                None,
                0,
                "no-match",
                "Unmapped",
                matching_reasons=[],
                source_tokens=self.feature_payload(source),
                alternatives=[],
            ))

        return [asdict(result) for result in suggestions]

    def score_pair(self, source: HeaderFeatures, target: HeaderFeatures) -> dict:
        if not source.normalized or not target.normalized:
            return {"score": 0.0, "method": "empty", "reasons": []}

        if source.original == target.original:
            return {"score": 1.0, "method": "exact", "reasons": ["Exact header match"]}
        if source.normalized == target.normalized:
            return {"score": 0.98, "method": "normalized", "reasons": ["Same normalized header"]}
        if source.compact == target.compact:
            return {"score": 0.96, "method": "special-character-normalized", "reasons": ["Same text after spacing and punctuation cleanup"]}

        incompatibility = self.incompatibility_reason(source, target)
        if incompatibility:
            return {"score": 0.0, "method": "incompatible", "reasons": [incompatibility]}

        reasons: list[str] = []
        score_parts: list[float] = []
        text_score = SequenceMatcher(None, source.normalized, target.normalized).ratio()
        token_score = self.token_similarity(source.token_set, target.token_set)
        score_parts.extend([text_score * 0.22, token_score * 0.18])
        if text_score >= 0.9:
            score_parts.append(0.35)
            reasons.append("Very similar normalized text")

        source_synonym = self.synonym_lookup.get(source.normalized)
        target_synonym = self.synonym_lookup.get(target.normalized)
        if source_synonym and source_synonym == target_synonym:
            score_parts.append(0.55)
            reasons.append("Known synonym group")

        if source.field_kind and source.field_kind == target.field_kind:
            score_parts.append(0.68)
            reasons.append("Same academic identity field")

        if source.metric_role or target.metric_role:
            if source.metric_role == target.metric_role:
                score_parts.append(0.18)
                reasons.append("Same calculated/metric column role")
            else:
                score_parts.append(-0.55)
                reasons.append("Different calculated/metric column role")

        if source.assessment_type and source.assessment_type == target.assessment_type:
            score_parts.append(0.24)
            reasons.append("Compatible assessment type")
        elif source.assessment_type and target.assessment_type:
            score_parts.append(-0.45)
            reasons.append("Different assessment type")

        if source.phase and target.phase:
            if source.phase == target.phase:
                score_parts.append(0.18)
                reasons.append("Semantically equivalent assessment phase")
            else:
                score_parts.append(-0.24)
                reasons.append("Different assessment phase")

        numeric = self.numeric_score(source, target, reasons)
        score_parts.append(numeric)

        if source.mode and target.mode:
            if source.mode == target.mode:
                score_parts.append(0.06)
                reasons.append("Same theory/practical indicator")
            else:
                score_parts.append(-0.12)
                reasons.append("Different theory/practical indicator")

        if source.clo_number and target.clo_number:
            if source.clo_number == target.clo_number:
                score_parts.append(0.08)
                reasons.append("Same CLO number")
            else:
                score_parts.append(-0.45)
                reasons.append("Different CLO number")

        score = max(0.0, min(1.0, sum(score_parts)))
        score = self.apply_score_caps(source, target, score, reasons)
        method = self.method_for(source, target, score, reasons)
        return {"score": round(score, 4), "method": method, "reasons": reasons or ["Text similarity"]}

    def incompatibility_reason(self, source: HeaderFeatures, target: HeaderFeatures) -> str:
        if source.field_kind or target.field_kind:
            if source.field_kind != target.field_kind:
                return "Different identity field"
            return ""

        if source.metric_role and target.metric_role and source.metric_role != target.metric_role:
            return "Different calculated/metric column role"

        if source.assessment_type and target.assessment_type and source.assessment_type != target.assessment_type:
            return "Different assessment type"

        return ""

    def apply_score_caps(self, source: HeaderFeatures, target: HeaderFeatures, score: float, reasons: list[str]) -> float:
        capped = score
        if source.assessment_type and target.assessment_type and source.assessment_type != target.assessment_type:
            capped = min(capped, self.fuzzy_min - 0.05)

        if source.assessment_type == target.assessment_type and source.assessment_type in {"quiz", "assignment", "term"}:
            if source.assessment_number is not None and target.assessment_number is not None and source.assessment_number != target.assessment_number:
                capped = min(capped, self.fuzzy_min - 0.05)
                reasons.append("Different assessment number")
            if source.question_number is not None and target.question_number is not None and source.question_number != target.question_number:
                capped = min(capped, self.fuzzy_min - 0.05)
                reasons.append("Different question number")

        if source.phase and target.phase and source.phase != target.phase:
            capped = min(capped, self.fuzzy_min - 0.05)

        if source.clo_number and target.clo_number and source.clo_number != target.clo_number:
            capped = min(capped, self.fuzzy_min - 0.05)

        return capped

    def numeric_score(self, source: HeaderFeatures, target: HeaderFeatures, reasons: list[str]) -> float:
        score = 0.0
        if source.question_number is not None and target.question_number is not None:
            if source.question_number == target.question_number:
                score += 0.22
                reasons.append("Same question number")
            else:
                score -= 0.45
                reasons.append("Different question number")
        if source.assessment_number is not None and target.assessment_number is not None:
            if source.assessment_number == target.assessment_number:
                score += 0.40
                reasons.append("Same assessment number")
            else:
                score -= 0.35
                reasons.append("Different assessment number")
        return score

    def global_assignment(self, scores: list[list[dict]]) -> dict[int, int]:
        if not scores or not scores[0]:
            return {}
        source_count = len(scores)
        target_count = len(scores[0])
        best_score = -1.0
        best_assignment: dict[int, int] = {}

        if target_count <= 10 and source_count <= target_count:
            for target_order in itertools.permutations(range(target_count), min(source_count, target_count)):
                assignment = {source_index: target for source_index, target in enumerate(target_order)}
                total = self.assignment_score(scores, assignment)
                if total > best_score:
                    best_score = total
                    best_assignment = assignment
            return {src: tgt for src, tgt in best_assignment.items() if scores[src][tgt]["score"] >= self.fuzzy_min}

        if target_count > 18 or source_count > 40:
            return self.greedy_assignment(scores)

        # Dynamic-programming maximum-weight matching for moderately wide sheets.
        dp: dict[int, tuple[float, dict[int, int]]] = {0: (0.0, {})}
        for source_index in range(source_count):
            next_dp = dict(dp)
            for mask, (total, assignment) in dp.items():
                for target_index in range(target_count):
                    if mask & (1 << target_index):
                        continue
                    new_mask = mask | (1 << target_index)
                    new_total = total + self.assignment_weight(scores[source_index][target_index]["score"])
                    if new_total > next_dp.get(new_mask, (-1.0, {}))[0]:
                        next_assignment = dict(assignment)
                        next_assignment[source_index] = target_index
                        next_dp[new_mask] = (new_total, next_assignment)
            dp = next_dp
        _, assignment = max(dp.values(), key=lambda item: item[0])
        return {src: tgt for src, tgt in assignment.items() if scores[src][tgt]["score"] >= self.fuzzy_min}

    def greedy_assignment(self, scores: list[list[dict]]) -> dict[int, int]:
        candidates = sorted(
            [
                (item["score"], source_index, target_index)
                for source_index, row in enumerate(scores)
                for target_index, item in enumerate(row)
                if item["score"] >= self.fuzzy_min
            ],
            reverse=True,
        )
        used_sources: set[int] = set()
        used_targets: set[int] = set()
        assignment: dict[int, int] = {}
        for _, source_index, target_index in candidates:
            if source_index in used_sources or target_index in used_targets:
                continue
            assignment[source_index] = target_index
            used_sources.add(source_index)
            used_targets.add(target_index)
        return assignment

    def assignment_score(self, scores: list[list[dict]], assignment: dict[int, int]) -> float:
        return sum(self.assignment_weight(scores[src][tgt]["score"]) for src, tgt in assignment.items())

    def assignment_weight(self, score: float) -> float:
        if score < self.fuzzy_min:
            return -0.25
        return score

    def alternatives(self, source_scores: list[dict], target_headers: list[dict], selected_index: int | None) -> list[dict]:
        ranked = sorted(
            [
                {
                    "target_column": target_headers[index]["name"],
                    "confidence_score": round(item["score"], 2),
                    "matching_reasons": item["reasons"],
                }
                for index, item in enumerate(source_scores)
                if index != selected_index and item["score"] >= self.fuzzy_min
            ],
            key=lambda item: item["confidence_score"],
            reverse=True,
        )
        return ranked[:3]

    def method_for(self, source: HeaderFeatures, target: HeaderFeatures, score: float, reasons: list[str]) -> str:
        if source.field_kind and source.field_kind == target.field_kind:
            return "academic-field"
        if "Known synonym group" in reasons:
            return "synonym"
        if source.phase and source.phase == target.phase:
            return "semantic-assessment"
        if score >= 0.75:
            return "semantic"
        return "fuzzy"

    def token_similarity(self, source_tokens: set[str], target_tokens: set[str]) -> float:
        if not source_tokens or not target_tokens:
            return 0.0
        return len(source_tokens & target_tokens) / len(source_tokens | target_tokens)

    def _assessment_type(self, tokens: list[str], token_set: set[str]) -> str:
        if "quiz" in token_set:
            return "quiz"
        if "assignment" in token_set:
            return "assignment"
        if (
            "term" in token_set
            or "exam" in token_set
            or "mid" in token_set
            or "midterm" in token_set
            or "final" in token_set
            or "end" in token_set
            or "endterm" in token_set
        ):
            return "term"
        if "question" in token_set or "q" in token_set:
            return "question"
        return ""

    def _assessment_number(self, tokens: list[str], assessment_type: str) -> int | None:
        if assessment_type in {"quiz", "assignment"}:
            return self._number_after(tokens, {assessment_type}) or self._number_after(tokens, {"q", "question"})
        if assessment_type == "term":
            return self._number_after(tokens, {"q", "question"})
        return None

    def _question_number(self, tokens: list[str]) -> int | None:
        return self._number_after(tokens, {"q", "question"})

    def _number_after(self, tokens: list[str], labels: set[str]) -> int | None:
        for index, token in enumerate(tokens[:-1]):
            if token in labels and tokens[index + 1].isdigit():
                return int(tokens[index + 1])
        return None

    def _phase(self, normalized: str, token_set: set[str]) -> str:
        compact = normalized.replace(" ", "")
        for phase, aliases in PHASE_ALIASES.items():
            if compact in {alias.replace(" ", "") for alias in aliases}:
                return phase
            if any(alias in normalized for alias in aliases):
                return phase
        if "mid" in token_set and "term" in token_set:
            return "early_term"
        if "first" in token_set and "term" in token_set:
            return "early_term"
        if "final" in token_set or ("end" in token_set and "term" in token_set):
            return "final_term"
        return ""

    def _mode(self, token_set: set[str]) -> str:
        if "theory" in token_set:
            return "theory"
        if "practical" in token_set or "lab" in token_set:
            return "practical"
        return ""

    def _metric_role(self, normalized: str, token_set: set[str]) -> str:
        compact = normalized.replace(" ", "")
        if "kpi" in token_set:
            return "kpi"
        if "achieved" in token_set or "attained" in token_set or "attainment" in token_set:
            return "achieved"
        if "weighted" in token_set or "weight" in token_set or "%weight" in compact:
            return "weighted"
        if {"score", "scored", "mark", "marks", "obtained"} & token_set:
            return "score"
        return ""

    def field_kind(self, value: str) -> str:
        text = self.normalize(value)
        compact = self.compact(value)
        if not text:
            return ""
        if (
            text.startswith("registration")
            or text.startswith("reg ")
            or "registration number" in text
            or "reg number" in text
            or "reg no" in text
            or "roll number" in text
            or "roll no" in text
            or compact.startswith("registrat")
        ):
            return "registration"
        if text in {"name", "student", "student name", "full name"} or text.endswith(" name"):
            return "student_name"
        return ""

    def feature_payload(self, features: HeaderFeatures) -> dict:
        return {
            "normalized": features.normalized,
            "tokens": features.tokens,
            "assessment_type": features.assessment_type,
            "phase": features.phase,
            "question_number": features.question_number,
            "assessment_number": features.assessment_number,
            "clo_number": features.clo_number,
            "mode": features.mode,
            "field_kind": features.field_kind,
            "metric_role": features.metric_role,
        }

    def _result(
        self,
        source: str,
        target: str | None,
        score: float,
        method: str,
        status: str,
        matching_reasons: list[str] | None = None,
        source_tokens: dict | None = None,
        target_tokens: dict | None = None,
        alternatives: list[dict] | None = None,
    ) -> MatchResult:
        return MatchResult(
            source_column=source,
            suggested_target_column=target,
            confidence_score=round(score, 2),
            confidence_label=confidence_label(score),
            matching_method=method,
            status=status,
            matching_reasons=matching_reasons or [],
            source_tokens=source_tokens or {},
            target_tokens=target_tokens or {},
            alternatives=alternatives or [],
        )
