# HealthPilot 阶段 0 基线报告

检查日期：2026-09-24（Asia/Shanghai）。范围是安全建立 Fork、验证未修改的上游业务代码和建立开发说明；没有开发症状模块。

## 仓库与依赖基准

- Fork：<https://github.com/LehnsherrYu/HealthPilot>
- origin：`https://github.com/LehnsherrYu/HealthPilot.git`
- upstream：`https://github.com/CodeWithCJ/SparkyFitness.git`
- 分支：`healthpilot/bootstrap`
- 上游基准：`a2fad85761eba18890b0ab3b7229c64f97b95544`
- `git describe --tags --always`：`v1.7.2-29-ga2fad8576`
- 应用包版本：`1.7.2`；最近 Release 为 v1.7.2。
- 安装前后 `git hash-object pnpm-lock.yaml` 均为 `93b3baefc09c0fb493a257cf50aaf780a93b4dc1`；锁文件和依赖声明未变化。
- 上游 LICENSE、版权、业务代码及数据库迁移文件均未修改。

初始目录为空且不是 Git 仓库；确认账号没有该上游 Fork 或 HealthPilot 同名仓库后创建 Fork，再克隆。GitHub CLI 认证经正常联网确认有效。克隆直连成功；一次 upstream fetch 直连发生 HTTP/2 framing error，按规则仅该次重试使用 Clash，随后从 upstream/main 创建开发分支。没有修改全局代理或 Git 设置。

## 本机环境

| 项目         | 命令或检查                                                     | 实际结果                                                            |
| ------------ | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| 系统         | `sw_vers`、`uname -m`                                          | macOS 26.2，build 25C56，arm64                                      |
| Git          | `git --version`                                                | 2.50.1（Apple Git-155）                                             |
| GitHub CLI   | `gh --version`、`gh auth status`                               | 2.100.0；人工批准联网后认证正常                                     |
| Docker       | Docker.app 内的 `docker --version`、`docker info`              | CLI / Engine 29.8.0，aarch64，Docker Desktop                        |
| Compose      | `docker compose version`                                       | v5.5.1                                                              |
| Node         | `node --version`                                               | v24.15.0，符合前端/服务端 CI 和开发 Dockerfile 的 Node 24           |
| Corepack     | `corepack --version`                                           | 0.34.6                                                              |
| 项目 pnpm    | `COREPACK_HOME="$PWD/.cache/corepack" corepack pnpm --version` | 10.33.4                                                             |
| 原有 pnpm    | `pnpm --version`                                               | 11.25.0；未全局替换                                                 |
| Apple 工具   | `xcode-select -p`、`xcodebuild -version`                       | 只有 Command Line Tools；完整 Xcode 未安装                          |
| SDK / 编译器 | `xcrun --show-sdk-version`、`clang --version`                  | macOS SDK 26.2，Clang 17.0.0                                        |
| Java         | `java -version`、`javac -version`                              | 17.0.2                                                              |
| Android      | `adb version`、SDK 目录检查                                    | ADB 1.0.41 / 37.0.1；Platforms 36、37.0；Build Tools 36.0.0、37.0.0 |
| SDK Manager  | `sdkmanager --version`                                         | 提示迁移到 Android CLI，版本显示 unknown                            |

当前终端 PATH 未包含 Docker CLI，实际使用 `/Applications/Docker.app/Contents/Resources/bin/docker`。没有全局改写 PATH。

已阅读根及四个 package 的 AGENTS.md、agent-docs 全部指南、实际 package scripts、CI、官方开发/测试说明、Docker 开发文件、环境模板和许可证。旧开发文档仍含 npm 命令、旧服务端脚本及 `docs/content/` 路径；实际文档位于 `docs/src/`，执行依据为当前 package scripts 和包级规则。Mobile CI 的 Node 20 与其当前依赖栈存在历史差异；本轮所有 JS/TS 检查实际使用 Node 24.15.0。

## 安装

在仓库根目录执行（Corepack 和 store 均留在被忽略的项目目录）：

```bash
COREPACK_HOME="$PWD/.cache/corepack" COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  SCARF_ANALYTICS=false DO_NOT_TRACK=1 \
  corepack pnpm install --frozen-lockfile --store-dir .pnpm-store
```

退出码 0，pnpm 输出完成时间 58.6 秒，2258 个包完成安装。没有使用 npm/yarn，没有更新依赖、锁文件或执行全仓格式修复。

## 测试和构建

以下 `pnpm` 均通过 `corepack pnpm` 执行，并指定项目内的 `COREPACK_HOME`。测试原始报告仅存放在被 Git 忽略的 `private/baseline/`，不进入提交。

| 包 / 检查                | 实际命令（包目录内）                                                                                                                                       | 结果                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Frontend validate        | `corepack pnpm run validate`                                                                                                                               | 退出码 0：类型、lint、格式、Knip 通过                                                   |
| Frontend 测试            | `corepack pnpm run test:ci --watchman=false --json --outputFile=...`                                                                                       | 147 个测试文件、1368 项测试全部通过                                                     |
| Frontend build           | `corepack pnpm run build`                                                                                                                                  | 退出码 0；5967 个模块转换完成，Vite 构建及 PWA 产物成功                                 |
| Server validate          | `corepack pnpm run validate`                                                                                                                               | 退出码 0：类型、lint、格式通过                                                          |
| Server 非数据库测试      | `NODE_ENV=test SKIP_RLS_MATRIX=1 SPARKY_FITNESS_DB_HOST=127.0.0.1 SPARKY_FITNESS_DB_PORT=65534 corepack pnpm run test:ci --reporter=json --outputFile=...` | 批准本机监听权限后退出码 0；4857 项通过；数据库相关项单独补测                           |
| Server 独立测试库迁移    | `corepack pnpm run test:migrations`                                                                                                                        | 退出码 0；在新建的 healthpilot_baseline_test 数据库执行                                 |
| Server 数据库集成        | `RUN_DATABASE_INITIALIZATION_TEST=1 corepack pnpm exec vitest run integration.test.ts --no-file-parallelism --reporter=json --outputFile=...`              | 11 个文件、341 项全部通过；包含 242 项 RLS、认证 schema、迁移、初始化锁及 schema parity |
| Mobile validate          | `corepack pnpm run validate`                                                                                                                               | 退出码 0：i18n 生成检查、类型、lint、i18n audit、Knip、原生翻译和格式检查通过           |
| Mobile Jest              | `NODE_ENV=test corepack pnpm exec jest --watchman=false --runInBand --json --outputFile=...`                                                               | 437 个测试文件、6969 项全部通过                                                         |
| Shared                   | 三个消费包的 validate 和相关测试                                                                                                                           | 通过；共享包未定义独立 validate/test/build 脚本                                         |
| Server / Mobile 原生构建 | 检查 scripts 和本机工具条件                                                                                                                                | Server 没有单独 build 脚本；Mobile 本轮未执行 iOS/Android 原生构建或设备验证            |

Server 总计覆盖 **5188 个不同测试，全部通过**。两轮的 4857 和 341 有 10 项重叠，不能直接相加。非数据库一轮的 JSON 明细为 305 个 skipped 加 26 个 pending；这 331 项均在后续独立数据库测试中通过。Vitest 文本摘要未单列 26 个 pending，故以上统计以逐项 JSON 合并去重为准。

首次 Server 测试在沙盒内失败：722 项失败，其中 721 项为 Supertest 无法获取监听端口，一项直接报 `listen EPERM`；根因是沙盒禁止本机监听。人工批准后重跑同一代码成功。未修改业务代码、测试断言或跳过失败用例来制造全绿。

Frontend build 有非阻断性上游警告：部分 chunk 超过 1000 kB，以及 Vite 配置的 `__dirname` 不兼容未来默认 native config loader。未修改打包规则或依赖。

## 本地配置与运行验证

`.env` 从 `docker/.env.example` 生成，随机强密钥及独立数据库角色凭据已配置；文件权限为 0600，并经 `git check-ignore .env` 确认忽略。未配置真实模型密钥、SMTP 或外部健康服务账号，未调用付费 AI。

新增 `docker/docker-compose.healthpilot.yml` 是官方开发 Compose 的本地数据库覆盖配置：使用上游 PostgreSQL 18.3-alpine，仅发布 `127.0.0.1:5432`，独立容器和持久卷，且数据库容器不读取完整应用环境文件。前后端使用本机源码 package scripts。

| 验证         | 实际结果                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------- |
| 数据库       | healthpilot-db 为 healthy；持久卷为 healthpilot_healthpilot-postgresql                      |
| 首次后端启动 | `corepack pnpm start` 成功；232 个上游迁移完成，RLS 初始化完成                              |
| 后端健康     | `GET http://127.0.0.1:3010/api/health` → HTTP 200，`{"status":"UP"}`                        |
| 前端代理     | `GET http://127.0.0.1:8080/api/health` → HTTP 200，`{"status":"UP"}`                        |
| 登录配置     | `GET http://localhost:8080/api/auth/settings` → HTTP 200，邮箱登录和注册启用                |
| 匿名会话     | `GET http://localhost:8080/api/auth/get-session` → HTTP 200，`null`                         |
| 网页         | `http://localhost:8080/login` → HTTP 200；浏览器正常渲染登录表单                            |
| 注册界面     | 点击 Sign Up 后正常显示姓名、邮箱、密码和注册按钮                                           |
| 浏览器控制台 | 登录与注册界面检查均无 warning/error                                                        |
| 截图         | `private/baseline/login.png`、`private/baseline/register.png`，仅空表单，无个人信息，未提交 |

没有注册真实或合成应用账号，没有填写个人信息或健康记录。本轮验证了页面和匿名认证接口，不表示完成注册、实际登录、邮件、第三方登录、MFA、原生移动端或生产部署验收。

前端监听 127.0.0.1:8080；数据库监听 127.0.0.1:5432。上游后端 `app.listen(PORT)` 默认监听所有接口（实测 `*:3010`），本轮保持业务代码不变，不能声称后端端口已经限制为仅回环访问；不要将这个开发实例作为公网部署。

## 以后启动和正常停止

先启动 Docker Desktop，在 HealthPilot 仓库根目录执行数据库命令：

```bash
/Applications/Docker.app/Contents/Resources/bin/docker compose \
  --env-file .env -p healthpilot \
  -f docker/docker-compose.dev.yml \
  -f docker/docker-compose.healthpilot.yml \
  up -d --wait --no-deps sparkyfitness-db
```

在两个终端分别启动源码服务，命令均从仓库根目录执行：

```bash
# 终端一：后端
COREPACK_HOME="$PWD/.cache/corepack" corepack pnpm -C SparkyFitnessServer start
```

```bash
# 终端二：前端
COREPACK_HOME="$PWD/.cache/corepack" corepack pnpm -C SparkyFitnessFrontend \
  dev --host 127.0.0.1 --strictPort
```

访问 <http://localhost:8080/login>。启动前若 3010/8080 已有本轮进程运行，不要重复启动。

正常停止前后端：各终端按 `Ctrl+C`。本轮由后台进程组启动，当前 PID 保存在被忽略的 `private/baseline/server.pid` 和 `frontend.pid`；停止这些后台进程前应先核对进程命令和所属目录，避免使用陈旧 PID。

停止数据库但保留容器和持久数据：

```bash
/Applications/Docker.app/Contents/Resources/bin/docker compose \
  --env-file .env -p healthpilot \
  -f docker/docker-compose.dev.yml \
  -f docker/docker-compose.healthpilot.yml \
  stop sparkyfitness-db
```

不要使用删除卷、清空目录或重置数据库的停止方式。`.env` 中的认证和加密密钥应稳定保留，不要每次启动重新生成。

## 复查命令和当前限制

```bash
git status --short
git diff --exit-code upstream/main -- LICENSE pnpm-lock.yaml package.json pnpm-workspace.yaml
git diff --exit-code upstream/main -- SparkyFitnessFrontend SparkyFitnessServer SparkyFitnessMobile shared
git check-ignore .env private/baseline/login.png .cache/corepack .pnpm-store
```

- 完整 Xcode 尚未安装；iOS 原生编译、签名和设备运行留待移动端阶段。
- Android 仅检查已有工具并运行 JS/TS/Jest 基线；未构建 APK/AAB 或测试设备健康权限。
- 未启用 SMTP，Compose 因未配置可选邮件字段和管理员邮箱给出空值提示；数据库正常启动。
- 本地源码服务和数据库保持运行。没有删除数据库、卷或现有项目，没有向上游创建 PR，没有向 main 强推。
- 进入下一阶段前，应先审核本报告；之后再评估已有症状能力、端口绑定、数据备份恢复及需求边界。本轮不继续开发功能。
