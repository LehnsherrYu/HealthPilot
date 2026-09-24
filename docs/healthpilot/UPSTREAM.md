# 上游来源与更新流程

## 来源记录

- 上游：<https://github.com/CodeWithCJ/SparkyFitness>
- upstream：`https://github.com/CodeWithCJ/SparkyFitness.git`
- Fork：<https://github.com/LehnsherrYu/HealthPilot>
- origin：`https://github.com/LehnsherrYu/HealthPilot.git`
- 基准分支：`upstream/main`
- 基准 commit：`a2fad85761eba18890b0ab3b7229c64f97b95544`
- 检查日期：2026-09-24（Asia/Shanghai）
- 基准描述：`v1.7.2-29-ga2fad8576`；应用包版本为 `1.7.2`，基准不等同于 v1.7.2 tag。
- 初始化开发分支：`healthpilot/bootstrap`
- 根 packageManager：`pnpm@10.33.4`。

Fork 保留上游 Git 历史；没有创建独立空仓库。初始化阶段保留所有上游业务代码、包声明、锁文件、版权声明和 LICENSE。

## 获取更新

先检查工作区是否干净，阅读目标版本 release notes、迁移说明、许可证变化、AGENTS.md 和包规则，再获取上游引用：

```bash
git status --short
git fetch upstream main --tags
git log --oneline HEAD..upstream/main
git diff --stat HEAD...upstream/main
```

`fetch` 只更新引用，不表示已经批准合并。不得自动切换依赖、重写锁文件或无审查升级镜像。

## 在专用分支评估和合并

从已审核的 HealthPilot 开发分支创建新的更新分支；把下例中的日期替换为实际日期：

```bash
git switch healthpilot/bootstrap
git switch -c healthpilot/upstream-YYYYMMDD
git merge --no-commit --no-ff upstream/main
```

如有冲突，逐项审查，不覆盖本地数据或未提交改动，不使用强制重置、清理或强推。合并前后分别记录基线结果；阅读并验证数据库迁移，先备份自己的数据，在隔离测试数据库中验证升级。

审查完整 diff，并按 [BASELINE_REPORT.md](BASELINE_REPORT.md) 运行三端 validate、测试、前端 build 和独立数据库集成测试。确认许可证、健康数据访问控制、依赖和运行行为没有不可接受变化后，才提交和推送到自己的 Fork。不要向上游自动创建 PR，不向 main 强推。

## 版本与网络原则

- 使用当前仓库声明的 Node/pnpm 要求；本基准在 Node 24.15.0、pnpm 10.33.4 上验证。
- 从仓库根目录用 Corepack 和冻结锁文件安装，不混用 npm/yarn，不全局切换其他项目的 pnpm。
- GitHub 先尝试直连；只有该操作直连失败后，才对该条命令设置 `HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897`。
- 不永久修改系统代理或全局 Git 配置，不提交凭据和本地环境文件。
