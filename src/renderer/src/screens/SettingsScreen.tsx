import { useEffect, useState } from 'react'
import {
  Check,
  CircleHelp,
  Database,
  KeyRound,
  LoaderCircle,
  Plug,
  Server,
  ShieldCheck,
  Sparkles
} from 'lucide-react'
import type {
  AppInfo,
  ConnectionResult,
  ProviderProfile,
  SettingsSnapshot
} from '../../../shared/schemas'
import { PROVIDER_PRESETS } from '../../../shared/constants'
import { errorMessage, isLocalEndpoint } from '../lib/utils'

interface SettingsProps {
  settings: SettingsSnapshot | null
  appInfo: AppInfo | null
  onChanged: () => Promise<void>
}

export function SettingsScreen({ settings, appInfo, onChanged }: SettingsProps) {
  const [profile, setProfile] = useState<ProviderProfile>(
    settings?.profile ?? {
      id: 'default',
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      reviewModel: '',
      authMode: 'user-key',
      timeoutMs: 90_000,
      concurrency: 3,
      reasoningEffort: 'medium',
      answerReview: true,
      monthlyTokenBudget: 0,
      inputPricePerM: 0,
      outputPricePerM: 0,
      hasApiKey: false
    }
  )
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [testResult, setTestResult] = useState<ConnectionResult | null>(null)
  const localOnly = isLocalEndpoint(profile.baseUrl) && !profile.hasApiKey

  useEffect(() => {
    if (settings) setProfile(settings.profile)
  }, [settings])

  const update = <K extends keyof ProviderProfile>(key: K, value: ProviderProfile[K]): void => {
    setProfile((current) => ({ ...current, [key]: value }))
  }

  const choosePreset = (presetId: string): void => {
    const preset = PROVIDER_PRESETS.find((item) => item.id === presetId)
    if (!preset) return
    setProfile((current) => ({
      ...current,
      name: preset.name,
      baseUrl: preset.baseUrl,
      model: preset.model,
      reviewModel: preset.reviewModel
    }))
    setTestResult(null)
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      await window.chujuan.saveSettings({
        profile: {
          ...profile
        },
        apiKey: apiKey.trim() || undefined
      })
      setApiKey('')
      await onChanged()
      setMessage('AI 设置已保存')
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setSaving(false)
    }
  }

  const test = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    setError('')
    try {
      const result = await window.chujuan.testProvider({
        profile: {
          ...profile
        },
        apiKey: apiKey.trim() || undefined
      })
      setTestResult(result)
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="screen settings-screen">
      <header className="screen-heading">
        <div>
          <p className="eyebrow">本机配置</p>
          <h1>AI 接口设置</h1>
          <p>兼容 OpenAI Chat Completions 接口。API Key 只用 Windows 安全存储加密保存在本机。</p>
        </div>
        <div className={profile.hasApiKey || localOnly ? 'security-badge ready' : 'security-badge'}>
          <ShieldCheck size={16} />
          {profile.hasApiKey ? 'Key 已加密保存' : localOnly ? '本地接口可直连' : '等待填写 Key'}
        </div>
      </header>

      <div className="settings-layout">
        <section className="settings-main">
          <div className="settings-section">
            <div className="settings-section-title">
              <Plug size={18} />
              <div><h2>接口预设</h2><p>选择后仍可修改地址和模型名。</p></div>
            </div>
            <div className="preset-grid">
              {PROVIDER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={profile.name === preset.name ? 'preset-option selected' : 'preset-option'}
                  onClick={() => choosePreset(preset.id)}
                >
                  <span className="preset-mark">{preset.name.slice(0, 1)}</span>
                  <span><strong>{preset.name}</strong><small>{preset.model}</small></span>
                  {profile.name === preset.name && <Check size={15} />}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">
              <Server size={18} />
              <div><h2>连接参数</h2><p>本地模型或兼容服务也可以直接填写。</p></div>
            </div>
            <div className="settings-form">
              <label>
                <span>Base URL</span>
                <input
                  className="text-input"
                  value={profile.baseUrl}
                  placeholder="https://api.example.com/v1"
                  onChange={(event) => update('baseUrl', event.target.value)}
                />
              </label>
              <label>
                <span>模型名称</span>
                <input
                  className="text-input"
                  value={profile.model}
                  placeholder="模型 ID"
                  onChange={(event) => update('model', event.target.value)}
                />
              </label>
              <label>
                <span>
                  复核模型 <small>可选，留空沿用主模型</small>
                </span>
                <input
                  className="text-input"
                  value={profile.reviewModel ?? ''}
                  placeholder="例如 deepseek-reasoner"
                  onChange={(event) => update('reviewModel', event.target.value)}
                />
              </label>
              <label className="wide-field">
                <span>
                  API Key
                  {profile.hasApiKey && <small>已保存，留空不会覆盖</small>}
                </span>
                <div className="key-input">
                  <KeyRound size={16} />
                  <input
                    type="password"
                    value={apiKey}
                    placeholder={profile.hasApiKey ? '••••••••••••••••' : 'sk-...'}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                </div>
              </label>
              <label>
                <span>单次请求超时</span>
                <select
                  className="select-input"
                  value={profile.timeoutMs}
                  onChange={(event) => update('timeoutMs', Number(event.target.value))}
                >
                  <option value={30000}>30 秒</option>
                  <option value={60000}>60 秒</option>
                  <option value={90000}>90 秒</option>
                  <option value={120000}>120 秒</option>
                  <option value={180000}>180 秒</option>
                </select>
              </label>
              <label>
                <span>并发生成数</span>
                <select
                  className="select-input"
                  value={profile.concurrency}
                  onChange={(event) => update('concurrency', Number(event.target.value))}
                >
                  <option value={1}>1 个请求</option>
                  <option value={2}>2 个请求</option>
                  <option value={3}>3 个请求</option>
                </select>
              </label>
              <label>
                <span>思考强度</span>
                <select
                  className="select-input"
                  value={profile.reasoningEffort}
                  onChange={(event) =>
                    update(
                      'reasoningEffort',
                      event.target.value as ProviderProfile['reasoningEffort']
                    )
                  }
                >
                  <option value="low">低 · 更快</option>
                  <option value="medium">中 · 平衡</option>
                  <option value="high">高 · 更细致</option>
                </select>
              </label>
              <label>
                <span>独立答案复核</span>
                <select
                  className="select-input"
                  value={profile.answerReview ? 'on' : 'off'}
                  onChange={(event) =>
                    update('answerReview', event.target.value === 'on')
                  }
                >
                  <option value="on">开启 · 更准确</option>
                  <option value="off">关闭 · 更省钱</option>
                </select>
              </label>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">
              <Database size={18} />
              <div>
                <h2>用量与预算</h2>
                <p>按接口单价估算花费；月度上限为 0 表示不限制。</p>
              </div>
            </div>
            <div className="usage-strip">
              <div>
                <span>本月请求</span>
                <strong>{settings?.usage.requests ?? 0}</strong>
              </div>
              <div>
                <span>本月 Tokens</span>
                <strong>{(settings?.usage.totalTokens ?? 0).toLocaleString('zh-CN')}</strong>
              </div>
              <div>
                <span>估算花费</span>
                <strong>¥{(settings?.usage.estimatedCost ?? 0).toFixed(2)}</strong>
              </div>
            </div>
            <div className="settings-form">
              <label>
                <span>月度 Token 上限</span>
                <input
                  className="select-input"
                  type="number"
                  min={0}
                  step={100000}
                  value={profile.monthlyTokenBudget}
                  onChange={(event) =>
                    update('monthlyTokenBudget', Math.max(0, Number(event.target.value) || 0))
                  }
                />
              </label>
              <label>
                <span>输入价格（元 / 百万 tokens）</span>
                <input
                  className="select-input"
                  type="number"
                  min={0}
                  step={0.1}
                  value={profile.inputPricePerM}
                  onChange={(event) =>
                    update('inputPricePerM', Math.max(0, Number(event.target.value) || 0))
                  }
                />
              </label>
              <label>
                <span>输出价格（元 / 百万 tokens）</span>
                <input
                  className="select-input"
                  type="number"
                  min={0}
                  step={0.1}
                  value={profile.outputPricePerM}
                  onChange={(event) =>
                    update('outputPricePerM', Math.max(0, Number(event.target.value) || 0))
                  }
                />
              </label>
            </div>
          </div>

          {error && <div className="error-bar compact"><span>{error}</span></div>}
          {message && <div className="inline-note green"><Check size={16} /><span>{message}</span></div>}
          {testResult && (
            <div className={testResult.ok ? 'inline-note green' : 'inline-note amber'}>
              {testResult.ok ? <Check size={16} /> : <CircleHelp size={16} />}
              <span>
                {testResult.ok
                  ? `连接成功，响应 ${testResult.latencyMs ?? 0} ms。`
                  : `连接失败：${testResult.message}`}
              </span>
            </div>
          )}

          <div className="settings-actions">
            <button className="secondary-button" onClick={test} disabled={testing}>
              {testing ? <LoaderCircle size={16} className="spin" /> : <Plug size={16} />}
              测试连接
            </button>
            <button className="primary-button" onClick={save} disabled={saving}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <ShieldCheck size={16} />}
              保存设置
            </button>
          </div>
        </section>

        <aside className="settings-side">
          <div className="settings-info-block">
            <Database size={18} />
            <h3>本地数据位置</h3>
            <p>{appInfo?.dataDirectory ?? '正在读取'}</p>
          </div>
          <div className="settings-info-block">
            <ShieldCheck size={18} />
            <h3>凭据保护</h3>
            <p>API Key 通过 Windows DPAPI 加密，不会写进日志、试卷文件或导出文件。</p>
          </div>
          <div className="settings-info-block note">
            <CircleHelp size={18} />
            <h3>兼容性提示</h3>
            <p>首版使用 Chat Completions。部分服务若不支持 JSON 模式，系统会自动改用普通文本返回。</p>
          </div>
          <div className="settings-info-block note">
            <Sparkles size={18} />
            <h3>省钱组合</h3>
            <p>初稿用便宜模型，复核模型单独选择更强的推理模型。只有拔高与独立验算会调用复核模型。</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

