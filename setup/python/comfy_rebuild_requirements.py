"""Read local pip requirements without resolving, downloading, or importing nodes."""
import json
import sys
from pip._internal.network.session import PipSession
from pip._internal.req.req_file import parse_requirements
from pip._internal.req.constructors import install_req_from_parsed_requirement
from pip._vendor.packaging.utils import canonicalize_name

session = PipSession()

def no_remote_requirements(*args, **kwargs):
    raise ValueError("Remote nested requirements need review before Python rebuild")

session.get = no_remote_requirements
names = set()
for filename in sys.argv[1:]:
    for parsed in parse_requirements(filename, session=session):
        requirement = install_req_from_parsed_requirement(parsed)
        if requirement.req is None:
            continue  # VCS metadata remains subject to the install constraints.
        if requirement.markers and not requirement.markers.evaluate({"extra": ""}):
            continue
        names.add(canonicalize_name(requirement.req.name))
print(json.dumps(sorted(names)))
