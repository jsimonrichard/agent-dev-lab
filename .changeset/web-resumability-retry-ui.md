---
"@agent-dev-lab/web": minor
---

Inspection UI for attempt-lineage resumability. Retry (run header and the workflow-row context menu) and Retry from here (step context menu and step inspector) seed a new attempt; the prior run stays listed. Retry is hidden, and the API returns 409, while any run in the forest is still running.

Copied and replayed steps and nested runs link back to the original. The waterfall grafts prior-attempt durations onto copied bars. Time that continues past the retry point is drawn dashed and is not treated as this attempt's order.
