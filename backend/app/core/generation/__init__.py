"""
Generation package.

Right now only the QUIZ generator is implemented.
Assignment and mid/final generators will be added later.
"""

from .quiz_generator import build_quiz_prompt
from .assignment_generator import build_assignment_prompt
from .midfinal_generator import build_midfinal_prompt

__all__ = ["build_quiz_prompt", "build_assignment_prompt" , "build_midfinal_prompt"]
