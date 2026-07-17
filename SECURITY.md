# Security Policy

## Reporting a vulnerability

If you discover a security issue in these examples, or a security concern in the Pagou API surface they
demonstrate, please report it privately. **Do not open a public issue or pull request for security
reports.**

- Email **security@pagou.ai** with a description of the issue and the steps to reproduce it.
- Alternatively, use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
  on this repository (Security → Report a vulnerability).

Please include:

- Affected language directory and flow, or the affected file and line.
- A clear description of the impact.
- Reproduction steps or a proof of concept.

We aim to acknowledge reports within a few business days. Please give us reasonable time to investigate
and address the issue before any public disclosure.

## What belongs here

This repository contains **example code only**. It never contains real credentials, customer data, or
production configuration. If you believe a secret or real data was committed by mistake, report it
through the channel above so it can be rotated and removed.

## Secrets in this repository

- `.env.example` files contain placeholders only. Never commit a real `.env`.
- All fixtures under `shared/fixtures/` are synthetic.
- Secret scanning and push protection are enabled on this repository. Pushes containing detected
  credentials are blocked.

If your own token is ever exposed, rotate it immediately in your Pagou dashboard.

## Scope

This policy covers the contents of this repository. Vulnerabilities in the Pagou platform itself should
also be reported to **security@pagou.ai** and will be routed to the appropriate team.
