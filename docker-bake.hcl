# =============================================================================
# Docker Buildx Bake definition for Hoox images.
#
# Local load:
#   docker buildx bake prod --load
#   docker buildx bake dev --load
#
# Publish to GHCR (requires `docker login ghcr.io`):
#   VERSION=0.9.3 REVISION=$(git rev-parse HEAD) PUBLISH_LATEST=true \
#     docker buildx bake prod --push
#
# Multi-arch release:
#   PLATFORMS=linux/amd64,linux/arm64 VERSION=0.9.3 PUBLISH_LATEST=true \
#     docker buildx bake prod --push
#
# CI main tip (no :latest):
#   VERSION=main REVISION=$SHA PUBLISH_LATEST=false docker buildx bake prod --push
# =============================================================================

variable "BUN_VERSION" {
  default = "1.3.14"
}

variable "VERSION" {
  default = "dev"
}

variable "REVISION" {
  default = "unknown"
}

variable "REGISTRY" {
  default = "ghcr.io/hoox-sh/hoox-setup"
}

variable "PLATFORMS" {
  # Single platform by default so --load works with the docker-container driver.
  # Override for release multi-arch: PLATFORMS=linux/amd64,linux/arm64
  default = "linux/amd64"
}

variable "PUBLISH_LATEST" {
  # "true" on release tags / workflow_dispatch; "false" on main continuous builds
  # so :latest stays a release pointer, not the tip of main.
  default = "false"
}

group "default" {
  targets = ["prod"]
}

group "all" {
  targets = ["prod", "dev"]
}

target "prod" {
  context    = "."
  dockerfile = "Dockerfile.prod"
  platforms  = split(",", PLATFORMS)
  tags = compact([
    "${REGISTRY}:${VERSION}",
    notequal(REVISION, "unknown") ? "${REGISTRY}:sha-${substr(REVISION, 0, 7)}" : "",
    and(equal(PUBLISH_LATEST, "true"), and(notequal(VERSION, "dev"), notequal(VERSION, ""))) ? "${REGISTRY}:latest" : "",
  ])
  args = {
    BUN_VERSION = BUN_VERSION
    VERSION     = VERSION
    REVISION    = REVISION
  }
  labels = {
    "org.opencontainers.image.title"       = "hoox-setup"
    "org.opencontainers.image.description" = "Hoox self-hosted production image (multi-worker Bun.serve router)"
    "org.opencontainers.image.source"      = "https://github.com/hoox-sh/hoox-setup"
    "org.opencontainers.image.licenses"    = "Apache-2.0"
    "org.opencontainers.image.version"     = VERSION
    "org.opencontainers.image.revision"    = REVISION
  }
  # GHA cache is used in CI; locally BuildKit skips unavailable exporters.
  cache-from = ["type=gha,scope=hoox-prod"]
  cache-to   = ["type=gha,scope=hoox-prod,mode=max"]
}

target "dev" {
  context    = "."
  dockerfile = "Dockerfile.dev"
  platforms  = ["linux/amd64"]
  tags = [
    "hoox:dev",
  ]
  args = {
    BUN_VERSION = BUN_VERSION
  }
  cache-from = ["type=gha,scope=hoox-dev"]
  cache-to   = ["type=gha,scope=hoox-dev,mode=max"]
}
