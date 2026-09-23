# Security policy

## Supported versions

Only the latest tagged release receives security fixes. This project has no service-level agreement or guaranteed response time.

## Reporting a vulnerability

Please email [berke@beremaran.com](mailto:berke@beremaran.com) with the affected version, impact, and steps to reproduce. Do not report security issues in public issues or pull requests. Please avoid including secrets or real user data in the report.

If GitHub private vulnerability reporting is enabled after the repository becomes public, it may also be used. Until then, use email.

## Deployment notes

The HTTP service is unauthenticated and is intended for local use by default. It binds to `127.0.0.1`; changing the host can expose `/ask`, which can make requests to the configured upstream. Place it behind an access-controlled network boundary before exposing it to other users.
