---
name: test-validate
description: Test skill for validate-output hook
user_invocable: true
validate_prompt: |
  Check if the output contains:
  1. A greeting message
  2. The current date/time
  If any is missing, report what's missing.
---

# Test Validate Skill

This is a simple test skill to verify the validate-output hook works correctly.

## Instructions

When invoked, simply:
1. Say "Hello! This is a test skill."
2. Print the current date and time
3. Confirm the test is complete
