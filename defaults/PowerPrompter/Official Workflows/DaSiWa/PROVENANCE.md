These original ComfyUI workflow files are copied without modification from
https://github.com/darksidewalker/dasiwa-comfyui-workflows at commit
143bd6a47d844ddd7a68175db5c5ff3867f5febb (2026-09-30).

Author: DaSiWa / darksidewalker. License: GPL version 3; see LICENSE in this directory.
This license applies to the upstream workflow files, separately from Umbra's MIT code.
Model weights and custom node packages retain their own licenses and are not included here.

| Local file | Original path | Git blob SHA | SHA-256 |
| --- | --- | --- | --- |
| h3-26.json | C-MMH3/DaSiWa MiniMaxH3 MythicAlchemy C-MMH3-26.json | 9f7474daf69504768468e476606f43330820b7fc | d13b404cc77860fb8284cd4276c8057f1714583304ed6b03357bda799d83ca0d |
| ltx23-50.json | C-LTX23/DaSiWa LTX OmniForge C-LTX23-50.json | cdf4af45095b979b04c87639376e115ccc112bcb | f4a9e0c3abfff2c4e94525b312c463981090da7e5cb8a41cd479bb9779ab6933 |

These are editable ComfyUI graphs with subgraphs and upstream custom widgets.
Umbra uses ComfyUI's own serializer and DaSiWa's native graph serialization hooks to obtain the executable
API graph. It does not reconstruct or flatten these workflows itself. Captures are
stored separately in the existing user API workflow directory; the originals remain
immutable. Dependencies, GPU execution and output quality still require qualification.
