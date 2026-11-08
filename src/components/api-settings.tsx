"use client";

import { useEffect, useRef, useState } from "react";

export default function ApiSettings({ configured, onUse, onClear, busy, actionLabel }: {
  configured: { provider: string; model: string } | null;
  onUse: (form: HTMLFormElement) => string | null;
  onClear: () => void;
  busy: boolean;
  actionLabel: string;
}) {
  const keyInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const clearInput = () => { if (keyInput.current) keyInput.current.value = ""; };
    window.addEventListener("pagehide", clearInput);
    return () => { window.removeEventListener("pagehide", clearInput); clearInput(); };
  }, []);
  return <details className="api-settings" id="api-settings">
    <summary>使用自己的 AI · {configured ? "本标签页已设置" : "未设置"}</summary>
    <p className="privacy-note">仅支持 DeepSeek 和 OpenAI 官方接口。密钥仅在当前标签页暂存；生成时随请求发送至本站服务端，再转发至所选官方服务。刷新或清除后需重新填写。费用由你的供应商账号承担。不填写也能使用预置内容学习。</p>
    <form className="api-form" autoComplete="off" onSubmit={(event) => {
      event.preventDefault();
      const failure = onUse(event.currentTarget);
      setError(failure);
      if (!failure && keyInput.current) keyInput.current.value = "";
    }}>
      <label>供应商<select name="provider" defaultValue="deepseek"><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option></select></label>
      <label>模型名称<input type="text" name="model" required maxLength={100} autoComplete="off" spellCheck={false} placeholder="填写该供应商的可用模型名称" /></label>
      <label>API Key<input type="password" name="apiKey" ref={keyInput} required autoComplete="new-password" spellCheck={false} maxLength={512} aria-describedby="api-privacy" /></label>
      <p id="api-privacy" className="privacy-note">不会写入学习存档或浏览器存储。填写配置不会生成内容；点击下方主按钮后开始或继续 AI 学习。已有未完成的 AI 课程会直接继续，不重复生成。</p>
      <div className="api-actions"><button type="submit" className="primary" disabled={busy}>{busy ? "正在准备内容…" : actionLabel}</button><button type="button" className="text-button" onClick={() => { if (keyInput.current) keyInput.current.value = ""; setError(null); onClear(); }}>清除密钥</button></div>
      {error && <p role="alert" className="field-error">{error}</p>}
      <p className="api-status" role="status">{configured ? `当前配置：${configured.provider === "deepseek" ? "DeepSeek" : "OpenAI"} / ${configured.model}。仅本标签页生效，刷新后需重新填写。` : "本标签页未保存 API Key。"}</p>
    </form>
  </details>;
}
