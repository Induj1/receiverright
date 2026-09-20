# Record what the team actually learned

AI coding assistance is disclosed in the submission. Each teammate should explain and verify a real part of the project rather than inventing a coding contribution.

Choose a bounded area, inspect its implementation, run its workflow, and record a finding. Suggested areas are receiving arithmetic, extraction review, workspace recovery, revision snapshots, supplier review, or AWS deployment/economics. These are suggestions, not assigned or completed contributions.

For each person, fill in:

| Prompt | Actual answer |
| --- | --- |
| Name and role | TODO |
| What I inspected or tested myself | TODO |
| A failure or surprising behavior I observed | TODO |
| The design choice I can now explain | TODO |
| What I changed or recommended, and why | TODO |
| Evidence: commit, test result, trial notes, or recording | TODO |
| What remains limited or uncertain | TODO |

Useful questions to answer in your own words:

- Why is a missing count different from a known zero?
- Why does an invoice carton require an explicit pack size?
- Why must supplier responses stay bound to a specific saved record?
- What does S3 versioning preserve, and what does it not prove?
- How does recovery work when the original browser is unavailable?
- What can Textract infer from an invoice, and what requires physically counting goods?
- Which AWS cost grows with each extracted page, and what does the request quota not cover?

For the video, select one genuine lesson and explain the trigger, the decision, and the consequence in 10–15 seconds. Keep the detailed evidence in the repository. Do not claim that a suggested review, pilot, or test was completed before it actually was.
