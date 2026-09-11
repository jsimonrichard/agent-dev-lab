---
"@agent-dev-lab/web": patch
---

Fix the inspection UI chat slice for multi-round tool episodes: a single `agent.run()` commits once per tool round, and partitioning the shared `memoryScope` transcript by commit `total` previously kept whichever commit iterated last in a `Map`. The slice now keeps the highest total seen for that episode, so earlier rounds stay in "current" even when commit events arrive out of order.
