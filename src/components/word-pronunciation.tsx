"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chooseEnglishVoice } from "./word-display";

export function usePronunciation(contextKey: string) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [feedback, setFeedback] = useState({ word: "", message: "", playing: false });
  const active = useRef<SpeechSynthesisUtterance | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stop = useCallback(() => {
    clearTimeout(timeout.current);
    if (active.current) {
      active.current.onstart = active.current.onend = active.current.onerror = null;
      active.current = null;
      window.speechSynthesis.cancel();
    }
    setFeedback({ word: "", message: "", playing: false });
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const updateVoices = () => setVoices(synth.getVoices());
    const onVisibility = () => { if (document.hidden) stop(); };
    updateVoices();
    synth.addEventListener("voiceschanged", updateVoices);
    window.addEventListener("pagehide", stop);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      synth.removeEventListener("voiceschanged", updateVoices);
      window.removeEventListener("pagehide", stop);
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [stop]);

  useEffect(() => { stop(); }, [contextKey, stop]);

  function play(word: string) {
    stop();
    const report = (message: string, playing = false) => setFeedback({ word, message, playing });
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      report("此浏览器不支持单词发音，请使用支持系统语音的浏览器。");
      return;
    }
    try {
      const synth = window.speechSynthesis;
      const voice = chooseEnglishVoice(synth.getVoices());
      if (!voice) {
        report("英语语音暂不可用。请检查系统英语语音包，或稍后重试；仍可查看音标并继续学习。");
        return;
      }
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = 0.85;
      active.current = utterance;
      const finish = (message: string) => {
        if (active.current !== utterance) return;
        clearTimeout(timeout.current);
        active.current = null;
        report(message);
      };
      utterance.onstart = () => { if (active.current === utterance) report(`正在播放 · ${voice.lang}`, true); };
      utterance.onend = () => finish(`播放结束 · ${voice.lang}`);
      utterance.onerror = (event) => finish(event.error === "canceled" || event.error === "interrupted"
        ? "播放已停止。" : "发音播放失败，请检查系统语音或音频设备后重试。仍可继续学习。");
      report("正在准备发音…", true);
      timeout.current = setTimeout(() => {
        if (active.current !== utterance) return;
        stop();
        report("发音未能完成，请稍后重试。仍可查看音标并继续学习。");
      }, 12_000);
      synth.speak(utterance);
    } catch {
      stop();
      report("发音播放失败，请稍后重试。仍可继续学习。");
    }
  }

  return { play, stop, feedback, voice: chooseEnglishVoice(voices) };
}

export function PronounceButton({ word, speech }: { word: string; speech: ReturnType<typeof usePronunciation> }) {
  const current = speech.feedback.word === word;
  const playing = current && speech.feedback.playing;
  return <div className="pronunciation">
    <button type="button" className="secondary pronunciation-button" onClick={() => playing ? speech.stop() : speech.play(word)} aria-label={playing ? `停止 ${word} 的发音` : `播放 ${word} 的发音`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4Zm12-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></svg>{playing ? "停止播放" : "听发音"}
    </button>
    <p className="speech-status" role="status" aria-live="polite">{current ? speech.feedback.message : speech.voice ? `系统语音 · ${speech.voice.lang}` : "使用浏览器或系统英语语音"}</p>
  </div>;
}
