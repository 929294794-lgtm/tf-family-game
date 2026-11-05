猜猜我是谁｜Cloudflare 免费迁移版

本包保留原项目的网页和 37 张成员照片，并将原 Node.js 内存房间服务器改为 Cloudflare Worker + Durable Objects。
房间数据保存在 Durable Object 存储中，不再依赖 Render 免费实例内存；每个房间 24 小时无访问后自动过期。

重要：不要把本 ZIP 拖进“纯静态网站 / Pages 静态上传”入口。纯静态上传不会运行联机服务器。

推荐部署方式（需要 GitHub 账号与 Cloudflare 账号）：
1. 将本 ZIP 解压，把里面所有文件上传到一个新的 GitHub 仓库（文件夹结构保持不变）。
2. 在 Cloudflare Dashboard 打开 Workers & Pages，选择 Create application / Create Worker，再选择连接 GitHub 仓库（Connect to Git）。
3. 选择这个仓库。构建/部署命令使用：npm install && npx wrangler deploy
   如果页面要求 Root directory，填写 /（仓库根目录）。
4. 部署完成后打开 Cloudflare 给出的 workers.dev 地址。

如果 Cloudflare 当前界面只有“Drop a folder, or a zip”的纯静态上传区，请返回，不要在这里上传；该入口不能完成本项目的 Durable Objects 联机部署。

游戏接口与原版兼容：/api/create、/api/join、/api/state、/api/start、/api/ask、/api/answer、/api/guess、/api/rematch。
游戏规则：每局随机 25 人；双方各有自己的秘密 C 位；提问方提问，对方回答“是 / 不是 / 不确定”，回答后交换提问权；在自己的回合猜中对方秘密 C 位即胜利。

注意：免费额度仍有限制。Cloudflare 免费 Workers/Durable Objects 额度可能随政策调整；超出额度后请求可能受限。请在部署前确认控制台显示的当前额度。
