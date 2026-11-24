"""Offline validation for the Kubernetes manifests in deploy/k8s.

Checks that can be answered without a cluster: YAML validity, required
fields, and cross-references between the resources (selectors, service
names, secret keys, config map keys, probe ports).

Run from the repository root:

    python .github/scripts/validate-k8s.py
"""

import glob
import os
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FILES = sorted(glob.glob(os.path.join(ROOT, "deploy", "k8s", "*.yaml")))
errors = []
resources = {}


def fail(msg):
    errors.append(msg)


for path in FILES:
    with open(path, encoding="utf-8") as handle:
        docs = list(yaml.safe_load_all(handle))
    for doc in docs:
        if doc is None:
            continue
        for field in ("apiVersion", "kind", "metadata"):
            if field not in doc:
                fail(f"{path}: missing '{field}'")
        name = doc.get("metadata", {}).get("name")
        if not name:
            fail(f"{path}: missing metadata.name")
        key = (doc.get("kind"), name)
        if key in resources:
            fail(f"duplicate resource {key}")
        resources[key] = doc

if not resources:
    fail("no resources parsed")

namespaces = {name for (kind, name), doc in resources.items() if kind == "Namespace"}
if namespaces != {"pos"}:
    fail(f"expected exactly one Namespace named 'pos', got {namespaces}")

for (kind, name), doc in resources.items():
    if kind == "Namespace":
        continue
    ns = doc.get("metadata", {}).get("namespace")
    if ns != "pos":
        fail(f"{kind}/{name}: namespace is {ns!r}, expected 'pos'")

# Deployments: selector must select the pod template labels.
deployments = {name: doc for (kind, name), doc in resources.items() if kind == "Deployment"}
for name, doc in deployments.items():
    match = doc.get("spec", {}).get("selector", {}).get("matchLabels", {})
    labels = doc.get("spec", {}).get("template", {}).get("metadata", {}).get("labels", {})
    if not match:
        fail(f"Deployment/{name}: selector.matchLabels is empty")
    for key, value in match.items():
        if labels.get(key) != value:
            fail(f"Deployment/{name}: selector {key}={value} not in pod labels {labels}")

    pod_spec = doc["spec"]["template"]["spec"]
    for container in pod_spec.get("containers", []):
        cname = container.get("name", "?")
        if not container.get("image"):
            fail(f"Deployment/{name}/{cname}: no image")
        ports = {p.get("name") for p in container.get("ports", [])}
        for probe in ("livenessProbe", "readinessProbe", "startupProbe"):
            spec = container.get(probe)
            if not spec:
                continue
            http = spec.get("httpGet", {})
            if not http.get("path", "").startswith("/"):
                fail(f"Deployment/{name}/{cname}: {probe} path must start with '/'")
            port = http.get("port")
            if isinstance(port, str) and port not in ports:
                fail(f"Deployment/{name}/{cname}: {probe} uses port name {port!r} not in {ports}")
            if spec.get("periodSeconds", 0) < 1:
                fail(f"Deployment/{name}/{cname}: {probe} periodSeconds must be >= 1")
        security = container.get("securityContext", {})
        if security.get("readOnlyRootFilesystem") is not True:
            fail(f"Deployment/{name}/{cname}: readOnlyRootFilesystem must be true")
        if "ALL" not in security.get("capabilities", {}).get("drop", []):
            fail(f"Deployment/{name}/{cname}: capabilities must drop ALL")

# Services must select an existing Deployment's pods.
for (kind, name), doc in resources.items():
    if kind != "Service":
        continue
    selector = doc.get("spec", {}).get("selector", {})
    matched = [
        dname
        for dname, ddoc in deployments.items()
        if all(
            ddoc["spec"]["template"]["metadata"]["labels"].get(k) == v
            for k, v in selector.items()
        )
    ]
    if not matched:
        fail(f"Service/{name}: selector {selector} matches no Deployment")
    for port in doc.get("spec", {}).get("ports", []):
        target = port.get("targetPort")
        names = {p.get("name") for p in doc["spec"]["ports"]}
        if isinstance(target, str) and target not in names:
            fail(f"Service/{name}: targetPort {target!r} not a declared port")

# The nginx proxy target must resolve to a Service named exactly "api".
if ("Service", "api") not in resources:
    fail("Service/api is missing: the shared nginx.conf proxies to http://api:3000")

# Ingress backends must point at a declared Service and port.
for (kind, name), doc in resources.items():
    if kind != "Ingress":
        continue
    for rule in doc.get("spec", {}).get("rules", []):
        for path in rule.get("http", {}).get("paths", []):
            backend = path.get("backend", {}).get("service", {})
            service_name = backend.get("name")
            if ("Service", service_name) not in resources:
                fail(f"Ingress/{name}: backend service {service_name!r} is not declared")
                continue
            ports = {p.get("port") for p in resources[("Service", service_name)]["spec"]["ports"]}
            if backend.get("port", {}).get("number") not in ports:
                fail(f"Ingress/{name}: backend port not exposed by Service/{service_name}")

# Secret and ConfigMap references must resolve.
secrets = {name: doc for (kind, name), doc in resources.items() if kind == "Secret"}
configmaps = {name: doc for (kind, name), doc in resources.items() if kind == "ConfigMap"}


def check_env(source, env, where):
    for entry in env or []:
        ref = entry.get("valueFrom", {})
        if "secretKeyRef" in ref:
            key = ref["secretKeyRef"]
            target = secrets.get(key["name"])
            if target is None:
                fail(f"{where}: secret {key['name']!r} is not declared")
                continue
            declared = set(target.get("stringData", {})) | set(target.get("data", {}))
            if key["key"] not in declared and not key.get("optional"):
                fail(f"{where}: secret {key['name']} has no key {key['key']!r}")
        if "configMapKeyRef" in ref:
            key = ref["configMapKeyRef"]
            target = configmaps.get(key["name"])
            if target is None:
                fail(f"{where}: config map {key['name']!r} is not declared")
            elif key["key"] not in target.get("data", {}) and not key.get("optional"):
                fail(f"{where}: config map {key['name']} has no key {key['key']!r}")


for (kind, name), doc in resources.items():
    if kind == "Deployment":
        pod_spec = doc["spec"]["template"]["spec"]
        for container in pod_spec.get("containers", []):
            where = f"Deployment/{name}/{container.get('name')}"
            check_env(where, container.get("env"), where)
            for source in container.get("envFrom", []):
                if "configMapRef" in source:
                    cm = configmaps.get(source["configMapRef"]["name"])
                    if cm is None:
                        fail(f"{where}: envFrom config map {source['configMapRef']['name']!r} missing")
    if kind == "Job":
        pod_spec = doc["spec"]["template"]["spec"]
        for container in pod_spec.get("containers", []):
            where = f"Job/{name}/{container.get('name')}"
            check_env(where, container.get("env"), where)

# The migration Job must run the migration command.
for (kind, name), doc in resources.items():
    if kind == "Job":
        command = " ".join(doc["spec"]["template"]["spec"]["containers"][0].get("command", []))
        if "migrate" not in command or "deploy" not in command:
            fail(f"Job/{name}: command {command!r} does not run 'migrate deploy'")

# ConfigMaps that are created imperatively from files in the repository.
# They are documented in deploy/monitoring/README.md, so a missing manifest is
# not an error.
IMPERATIVE_CONFIGMAPS = {"pos-prometheus-config"}

for (kind, name), doc in resources.items():
    if kind != "Deployment":
        continue
    pod_spec = doc["spec"]["template"]["spec"]
    for volume in pod_spec.get("volumes", []):
        source = volume.get("configMap")
        if not source:
            continue
        cm_name = source["name"]
        if cm_name in IMPERATIVE_CONFIGMAPS:
            continue
        if cm_name not in configmaps:
            fail(f"Deployment/{name}: volume config map {cm_name!r} is not declared")

# The Prometheus Deployment must scrape the API through the `api` Service.
if ("Deployment", "pos-prometheus") in resources:
    prom = resources[("Deployment", "pos-prometheus")]
    args = prom["spec"]["template"]["spec"]["containers"][0].get("args", [])
    if not any("prometheus.yml" in arg for arg in args):
        fail("Deployment/pos-prometheus: no --config.file argument")
    if ("Service", "api") not in resources:
        fail("Service/api is missing: Prometheus scrapes api:3000")

print(f"parsed {len(resources)} resources from {len(FILES)} files")
if errors:
    for message in errors:
        print(f"FAIL {message}")
    sys.exit(1)
print("PASS all offline manifest checks")