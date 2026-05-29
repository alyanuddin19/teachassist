from typing import Any, Dict, List


def analyze_gaps(
    questions: List[Dict[str, Any]],
    students: List[Dict[str, Any]],
    threshold_percentage: float = 50.0
) -> Dict[str, Any]:

    clo_map: Dict[str, List[Dict[str, Any]]] = {}
    for q in questions:
        clo = q.get('clo')
        if clo:
            clo_map.setdefault(clo, []).append(q)

    gap_results = []
    for q in questions:
        qid = q['id']
        max_marks = float(q['max_marks'])
        threshold_marks = max_marks * (threshold_percentage / 100.0)

        below_students = []
        cleared_students = []
        for s in students:
            score = float(s.get('marks', {}).get(qid, 0))
            if score < threshold_marks:
                below_students.append(s.get('name', 'Unknown'))
            else:
                cleared_students.append(s.get('name', 'Unknown'))

        below_count = len(below_students)
        cleared_count = len(cleared_students)
        gap_percentage = round((below_count / len(students)) * 100, 2) if students else 0.0
        status = 'Gap Identified' if below_count > 0 else 'No Gap'

        gap_results.append({
            'question': qid,
            'clo': q.get('clo'),
            'max_marks': max_marks,
            'threshold_marks': round(threshold_marks, 2),
            'students_below_threshold': below_count,
            'students_cleared_threshold': cleared_count,
            'gap_percentage': gap_percentage,
            'student_names': below_students,
            'status': status
        })

    clo_results = []
    weak_clos = []

    if clo_map:
        for clo, qlist in clo_map.items():
            clo_max = sum(float(q['max_marks']) for q in qlist)
            clo_threshold = clo_max * (threshold_percentage / 100.0)

            below_students = []
            cleared_students = []
            for s in students:
                clo_total = sum(float(s.get('marks', {}).get(q['id'], 0)) for q in qlist)
                if clo_total < clo_threshold:
                    below_students.append(s.get('name', 'Unknown'))
                else:
                    cleared_students.append(s.get('name', 'Unknown'))

            below_count = len(below_students)
            cleared_count = len(cleared_students)
            gap_percentage = round((below_count / len(students)) * 100, 2) if students else 0.0
            status = 'Weak CLO' if below_count > 0 else 'OK'

            clo_item = {
                'clo': clo,
                'questions': [q['id'] for q in qlist],
                'max_marks': round(clo_max, 2),
                'threshold_marks': round(clo_threshold, 2),
                'students_below_threshold': below_count,
                'students_cleared_threshold': cleared_count,
                'gap_percentage': gap_percentage,
                'student_names': below_students,
                'status': status
            }
            clo_results.append(clo_item)

        clo_results.sort(key=lambda x: x['gap_percentage'], reverse=True)
        weak_clos = [c for c in clo_results if c['students_below_threshold'] > 0]

    total_max = sum(float(q['max_marks']) for q in questions)
    threshold_total_marks = total_max * (threshold_percentage / 100.0)

    student_totals = []
    for s in students:
        total = sum(float(v) for v in s.get('marks', {}).values())
        perc = round((total / total_max) * 100, 2) if total_max else 0.0
        student_totals.append({
            'name': s.get('name', 'Unknown'),
            'total_marks': round(total, 2),
            'total_percentage': perc,
            'below_total_threshold': total < threshold_total_marks
        })

    heatmap_questions = [
        {
            'id': q['id'],
            'clo': q.get('clo'),
            'max_marks': round(float(q['max_marks']), 2),
            'threshold_marks': round(float(q['max_marks']) * (threshold_percentage / 100.0), 2)
        }
        for q in questions
    ]
    heatmap_students = []
    for s in students:
        cells = []
        for q in questions:
            qid = q['id']
            max_marks = float(q['max_marks'])
            score = float(s.get('marks', {}).get(qid, 0))
            percentage = round((score / max_marks) * 100, 2) if max_marks else 0.0
            threshold_marks = max_marks * (threshold_percentage / 100.0)
            cells.append({
                'question': qid,
                'clo': q.get('clo'),
                'score': round(score, 2),
                'max_marks': round(max_marks, 2),
                'percentage': percentage,
                'below_threshold': score < threshold_marks
            })
        heatmap_students.append({
            'name': s.get('name', 'Unknown'),
            'roll_no': s.get('roll_no', ''),
            'cells': cells
        })

    return {
        'threshold_percentage': {'threshold': f'{threshold_percentage}%'},
        'gap_results': gap_results,
        'clo_results': clo_results,
        'weak_clos': weak_clos,
        'class_summary': {
            'total_max_marks': round(total_max, 2),
            'threshold_total_marks': round(threshold_total_marks, 2),
            'students': student_totals
        },
        'heatmap': {
            'questions': heatmap_questions,
            'students': heatmap_students
        }
    }
