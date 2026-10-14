These original ComfyUI workflow files are copied without modification from
https://github.com/darksidewalker/dasiwa-comfyui-workflows at the per-file revisions
recorded below.

Author: DaSiWa / darksidewalker. License: GPL version 3; see LICENSE in this directory.
This license applies to the upstream workflow files, separately from Umbra's MIT code.
Model weights and custom node packages retain their own licenses and are not included here.

| Local file | Original path | Git blob SHA | SHA-256 |
| --- | --- | --- | --- |
| h3-26.json | C-MMH3/DaSiWa MiniMaxH3 MythicAlchemy C-MMH3-32.json | d187573277406299c2b39c53a5625c18e8f15b87 | cc43599cc5e430b8af778cd0bdd48e367e4e55098e94d760d31b95501f830458 |
| ltx23-50.json | C-LTX23/DaSiWa LTX OmniForge C-LTX23-50.json | cdf4af45095b979b04c87639376e115ccc112bcb | f4a9e0c3abfff2c4e94525b312c463981090da7e5cb8a41cd479bb9779ab6933 |

These are editable ComfyUI graphs with subgraphs and upstream custom widgets.
Umbra uses ComfyUI's own serializer and DaSiWa's native graph serialization hooks to obtain the executable
API graph. It does not reconstruct or flatten these workflows itself. Captures are
stored separately in the existing user API workflow directory; the originals remain
immutable. Dependencies, GPU execution and output quality still require qualification.

H3 updated 2026-10-14: h3-26.json now contains the unmodified C-MMH3-32.json
from commit 1d3621410a9a1599d006dc252573de85b481461a; Git blob d187573277406299c2b39c53a5625c18e8f15b87,
SHA-256 cc43599cc5e430b8af778cd0bdd48e367e4e55098e94d760d31b95501f830458.
The h3-26 identifier is a retained storage key. LTX-50 remains byte-identical to commit 143bd6a47d844ddd7a68175db5c5ff3867f5febb (2026-09-30).
