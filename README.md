# homebridge-command-bulb

[![npm version](https://badge.fury.io/js/homebridge-command-bulb.svg)](https://badge.fury.io/js/homebridge-command-bulb)

在 HomeKit 中创建虚拟设备（灯），映射灯的亮度值到自定义的脚本上

Need I Say More?

Oh yes：搭配「场景」使用，可以自定义语音指令，可参阅 [歪用 HomeKit 让 Siri 更「听话」](https://sspai.com/post/39524)

## 配置

Homebridge 配置如下：

```json
{
    "platforms": [
        {
            "platform": "CommandPlatform",
            "directory": "~/.homebridge/commands",
            "tg_token": "",
            "tg_chat_id": "",
            "proxy": "http://localhost:8888"
        }
    ]
}
```

- 需要自己创建 Shell 脚本目录，默认为`~/.homebridge/commands`
- Telegram token 需要通过 @BotFather 申请；chat id 可以通过 @get\_id\_bot 获取
- 插件连接 Telegram 通常需要 proxy，请科学解决。如果是 socks proxy 的话可以用 privoxy 转换为 http proxy

重启 Homebridge 后会添加两个灯，「Command Bulb」和「Probe Bulb」，前者用于执行命令，后者用于排除模糊指令干扰（没有其它用处，请无视它的存在）

## 脚本规则

**脚本应具有可执行权限**，约定先于配置，脚本前缀、后缀采用如下规则：

- 前缀（前两位，01 - 99）用于映射亮度，比如「01」对应亮度为 1，此外，所有前缀为「01」的脚本都会被执行，可以一次执行多个独立脚本。预留了亮度为 0 和 100 两个值用于标识「成功 / 失败」，所以不要用「00」作为前缀
- 后缀用于辅助功能，目前是用于 Telegram 推送消息（在配置了相关参数的情况下）
	- 「.ok」表示执行结果为成功时推送「Command: xxx OK!」消息，要注意的是，执行过程中存在 stderr 不会被认为是失败
	- 「.tg」表示推送 stdout
	- 如果失败，总是会推送「Command: xxx Failed!」消息，无需后缀
	- 多个后缀可组合，如「.ok.tg」，会推送成功和标准输出两条消息
	- 其它未定义的及「.sh」可有可无，会忽略