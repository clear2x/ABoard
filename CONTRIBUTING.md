# Contributing to ABoard

感谢你对 ABoard 的关注！欢迎通过 Issue 和 Pull Request 参与贡献。

Thank you for your interest in ABoard! Contributions via Issues and Pull Requests are welcome.

## Development Setup / 开发环境

### Prerequisites / 前置条件

- **Node.js** >= 18
- **Rust** >= 1.77 (via [rustup](https://rustup.rs/))
- Platform deps per [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)

### Run / 运行

```bash
git clone https://github.com/clear2x/ABoard.git
cd ABoard
npm install
npm run tauri dev
```

### Build / 构建

```bash
npm run tauri build
```

## How to Contribute / 贡献方式

### Report Bugs / 报告问题

- Open a [GitHub Issue](../../issues)
- Include OS version, ABoard version, steps to reproduce

### Submit Changes / 提交代码

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Commit with a clear message (see conventions below)
5. Push and open a Pull Request

### Commit Conventions / 提交规范

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type(scope): description

feat(clipboard): add batch export support
fix(search): resolve FTS5 timeout on large datasets
docs: update README with AI setup guide
style: fix dark mode contrast in sidebar
refactor(db): use async connection pool
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Code Style / 代码风格

- **Rust:** Follow `cargo fmt` and `cargo clippy`
- **TypeScript/SolidJS:** Follow existing patterns in the codebase
- **CSS:** Use Tailwind utility classes, avoid custom CSS when possible

### Pull Request Checklist / PR 检查清单

- [ ] Code compiles without warnings (`npm run tauri build`)
- [ ] Changes tested locally
- [ ] Commit messages follow conventional format
- [ ] No unrelated changes in the PR

## Project Structure / 项目结构

```
src/               → SolidJS frontend (components, stores, styles)
src-tauri/src/     → Rust backend (ai, clipboard, db, tray)
src-tauri/icons/   → App icons for all platforms
tests/             → Test scripts
```

## License / 协议

By contributing, you agree that your code will be licensed under the [MIT License](LICENSE).
