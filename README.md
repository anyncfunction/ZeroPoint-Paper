# 零点出卷 · ZeroPoint Paper

面向初中数学教师的本地 AI 出卷桌面工具，Windows 安装版，无需自建后端。首版覆盖人教版、北师大版、苏科版 2024 新版七至九年级章节。

仓库地址：<https://github.com/anyncfunction/ZeroPoint-Paper>

## 已实现

- 四步出卷向导：年级教材、章节难度、题型题量、标题导出
- 兼容 OpenAI Chat Completions 的自定义 AI 接口
- 单选、填空、计算、解答、证明、应用六类题型
- 课程章节与知识点覆盖、1–10 级难度分配；9 级为中考难题，10 级为中考最后两道压轴题，并执行第二轮强制拔高
- 应用内 A4 预览、逐题编辑、单题重新生成
- 整卷或单题一键再拔高，自动保留“再拔高前”的本地备份
- 题量、总分、页数和考试时长支持直接输入
- 压轴题数量可单独设定：高难卷只让指定几道达到 10 级，其余保持 9 级
- 计算量与思维量分开调节，避免难度只靠堆数字
- 答题留白可选紧凑、标准、宽松，PDF 与 Word 使用同一留白比例
- 本地题库浏览，跨卷题干去重可勾选启用
- 跨卷去重同时使用精确指纹和相似度匹配，改几个字的旧题也能拦住
- 基于真实渲染高度的正文分页，预览与 PDF/Word 共用同一套页面块
- PDF、Word 双格式导出；Word 使用原生可编辑公式
- 受控数轴、坐标系、函数图，以及支持辅助点、交点和虚线的自定义几何图
- AI 思考强度可选低、中、高，默认中等
- 初稿模型与复核模型可分开配置；拔高与复核只返回需要修改的题和字段，不重复输出整卷
- 独立答案复核可开关，便于平衡准确率与调用成本
- 本地试卷库、历史重开、导出目录记录
- 试卷库支持按年级筛选、批量删除、复制为新卷
- 可另附 A4 答题卡 PDF，含选择题涂卡区和解答题作答框
- 记录每次生成的 tokens 与估算花费；设置月度 Token 上限，超限前阻止新请求
- 分节生成失败时保留已完成题组，重试只补未完成部分
- Windows DPAPI 加密保存 API Key

## 开发

```powershell
npm install
npm run dev
```

## 检查与测试

```powershell
npm run typecheck
npm test
node tests/e2e/ui-flow.cjs
node tests/e2e/full-flow.cjs
node tests/e2e/packaged-smoke.cjs
```

`full-flow.cjs` 使用本机回环地址上的模拟 AI 服务，不需要真实 API Key。

## 打包

```powershell
npm run package:win
```

安装包输出到 `release/0.1.9/零点出卷-0.1.9-安装版.exe`，每个版本独立目录，旧版本安装包不会被覆盖。

## 使用前配置

1. 打开“AI 设置”。
2. 选择 OpenAI、DeepSeek、通义或自定义接口。
3. 填写 Base URL、模型名称和 API Key。
4. 点“测试连接”，成功后保存。

本地 `localhost` 或 `127.0.0.1` 接口可以不填 API Key。

## 数据位置

- 设置、密钥和试卷库：`%APPDATA%\lingdian-chujuan`
- 默认导出的试卷：`文档\零点出卷\导出`

AI 生成内容会经过格式、公式和重复检查，但数学正确性仍需要教师审阅。

## 许可证

本项目采用 GNU General Public License v3.0（GPL-3.0-only），见 [LICENSE](LICENSE)。
可以自由用于教学、修改和再分发；再分发衍生作品时需同样以 GPL-3.0 开源，并保留版权与许可声明。
