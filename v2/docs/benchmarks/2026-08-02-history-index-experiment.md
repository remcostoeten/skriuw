# Git history index experiment

The documented baseline is 4,159.794 ms median for a 1,000-revision drain and
96,283.068 ms for 5,000 revisions on this host.

An experiment replaced each on-disk index update with an in-memory index rebuilt
from the current history-tip tree. The first three optimized-build 1,000-item
samples were 5,741.816 ms, 5,183.071 ms, and 5,763.388 ms. All 1,000 commits and
cache acknowledgements completed in the samples, but the approach was 24.6% or
more slower than the prior median. The run was stopped before the expensive
5,000-item phase and the adapter change was reverted.

The desktop drain now checks shutdown between items and yields after a bounded
64-item batch. That bounds scheduling and shutdown observation, but it does not
claim a throughput improvement. The 96-second large-backlog problem remains;
the next experiment needs a real same-thread Git session capable of retaining
an index across a batch without weakening `HistoryMaterializer: Send + Sync` or
the per-revision ref/ack crash contract.
