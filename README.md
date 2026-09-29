<p align="center">
  <img src="extension/icons/icon-128.png" alt="SynapseTab Logo" width="96" height="96">
</p>

<h1 align="center">SynapseTab</h1>

<p align="center">
  <strong>Ultra-lightweight, self-hosted workspace and tab state synchronization for Mozilla Firefox.</strong>
</p>

<p align="center">
  <a href="https://github.com/marchacio/SynapseTab/actions/workflows/ci.yml"><img src="https://github.com/marchacio/SynapseTab/actions/workflows/ci.yml/badge.svg" alt="Continuous Integration"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://addons.mozilla.org"><img src="https://img.shields.io/badge/Firefox-Manifest%20V3-FF7139.svg" alt="Firefox Manifest V3"></a>
  <a href="https://ghcr.io"><img src="https://img.shields.io/badge/Docker-amd64%20%7C%20arm64-blue" alt="Docker Multi-Arch"></a>
</p>


> Note: This project is currently under development. You’re welcome to try it out, modify it, improve it and report any bugs on the dedicated Issues page, or open a Pull Request – thank you very much for your help!
This project was created to meet my own needs, but as I’m a strong believer in the open-source community, I thought it would be useful and helpful to make it public and available to everyone 😄


## 1. Project goals

SynapseTab is an Open-Source tab and workspace synchronization system engineered for multi-workstation setups. It replaces proprietary cloud synchronization with a self-hosted solution that requires:
- **Zero cloud reliance**
- **Zero user accounts or telemetry**
- **Zero perceived latency**


TODO add gif showing a cool demo of SynapseTab

## 2. Installation




## 3. Local development

See [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) for everything related to local development and testing.


## 4. Automated testing suite

The codebase enforces strict test-driven development:

```bash
# Run all unit and integration tests
npm test

# Run pure reconciliation tests (diff.test.ts)
npm run test:extension

# Run Fastify & Redis integration tests (server.test.ts)
npm run test:server

# Validate Firefox MV3 compliance
npm run lint:web-ext
```

## 5. License

Released under the **MIT License**. 100% Free and Open-Source Software (FOSS).

## 6. AI usage

The entire project was developed using the Antigravity agent-based IDE (as you can see from the GEMINI.md file), in accordance with all best practices for software development and the use of AI.
