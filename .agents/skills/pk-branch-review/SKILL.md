---
name: pk-branch-review
description: "Full branch review: naming, simplicity, SOLID, then an architecture HTML report in plans/reviews."
disable-model-invocation: true
---

Do a full code review on this branch to make sure we're following our naming rules, keeping code simple to understand and use and extend. We use SOLID principles and creating clean code that wont become a ball of mud. Use the /simplify and /code-review skills. Use the /improve-codebase-architecture skill and roll up all the findings from your other reviews into the html report that that skill generates. Save it in plans/reviews with todays date and a short file name describing the branch or changeset.

When the review file is ready, commit it and push it.

Once written and committed do one more pass, check for ball of mud potential, api that could be made friendlier, code that could be self documented better, and that everything is solid and extensible and easy to understand/use. Update the review file accordingly.
