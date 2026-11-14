These ComfyUI workflow files are derived from
https://github.com/darksidewalker/dasiwa-comfyui-workflows at the per-file revisions
recorded below.

Author: DaSiWa / darksidewalker. License: GPL version 3; see LICENSE in this directory.
This license applies to the upstream workflow files, separately from Umbra's MIT code.
Model weights and custom node packages retain their own licenses and are not included here.

| Local file | Upstream path | Upstream Git blob SHA | Bundled SHA-256 |
| --- | --- | --- | --- |
| h3-26.json | C-MMH3/DaSiWa MiniMaxH3 MythicAlchemy C-MMH3-33.json | 7fe62bad2369bc7e43348571c4450f9e31021fce | cba462ef659ebb9c61d6a62f954164ece0b4b293220e5cdbad747b5ba79a1502 |
| ltx23-50.json | C-LTX23/DaSiWa LTX OmniForge C-LTX23-51.json | 8bb00011ce0db6fcc215c356a94538678f693e10 | 11dd7a6497511848c8c8029dac0ad1b2538404efc6683bd329e99e947472dd47 |

These are editable ComfyUI graphs with subgraphs and upstream custom widgets.
Umbra uses ComfyUI's own serializer and DaSiWa's native graph serialization hooks to obtain the executable
API graph. It does not reconstruct or flatten these workflows itself. Captures are
stored separately in the existing user API workflow directory; the originals remain
immutable. Dependencies, GPU execution and output quality still require qualification.

H3 updated 2026-10-14: h3-26.json now contains the unmodified C-MMH3-32.json
from commit 1d3621410a9a1599d006dc252573de85b481461a; Git blob d187573277406299c2b39c53a5625c18e8f15b87,
SHA-256 cc43599cc5e430b8af778cd0bdd48e367e4e55098e94d760d31b95501f830458.
The h3-26 identifier is a retained storage key.

H3 updated 2026-10-19: h3-26.json now contains the unmodified C-MMH3-33.json
from commit 43bc259f14bdcc790d10234a53321b1c1011c29c; Git blob 7fe62bad2369bc7e43348571c4450f9e31021fce,
SHA-256 cba462ef659ebb9c61d6a62f954164ece0b4b293220e5cdbad747b5ba79a1502.
This revision uses continuity segment prepare/decode for full-timeline and segment-only exports.
The h3-26 storage key remains stable; previous captures require refreshing.

LTX updated 2026-11-14 to C-LTX23-51 from upstream commit
befdca4f21e5bdd671a8ebf9e6c820f5f4aa7c50 (upstream SHA-256
d826b97f4076025b3b6b6c5f8ac2e2f61f64f5ae5dcd359a2a12a9c5f1356841).
Umbra removed one malformed connection record and restored the two missing links
from the Model Loader subgraph’s format selectors to its native If/Else Switch
nodes. The repaired links use IDs 8199 and 8200. The ltx23-50 storage key remains
stable for saved projects. Existing API captures require refreshing.
