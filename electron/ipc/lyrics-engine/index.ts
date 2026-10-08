import log from "electron-log";

import { scoreLyricCandidate, textSimilarity } from "@shared/lyrics/match";
import { parseLyrics } from "@shared/lyrics/parse";

import { lyricsMatchStore } from "../../store";
import { romanizeLines } from "./romanize";
import { fetchAllSources, fetchNeteaseById } from "./sources";
import { translateLines } from "./translate";

/**
 * 歌词解析管线。
 *
 * 职责划分：
 *   - 抓取（sources.ts）只负责拿回原文
 *   - 解析 / 归一化 / 打分（shared/lyrics）是纯逻辑，不碰网络
 *   - 翻译 / 罗马音是「按需加工」，由渲染端在需要时单独调，不在这里做
 *
 * 这样做的原因是翻译要发网络请求、罗马音要加载词典，
 * 把它们绑进「解析」会让每次切歌都变慢，而用户可能根本不开这两个开关。
 */

/** 相似度超过这个值就认为两个源指向同一份歌词 */
const CONSENSUS_THRESHOLD = 0.6;

const readMatchPick = (trackKey: string): LyricsMatchRecord | undefined => {
  try {
    return lyricsMatchStore.get(trackKey);
  } catch {
    return undefined;
  }
};

export async function resolveLyrics(params: LyricsResolveParams): Promise<LyricsResolveResult> {
  const { target, trackKey } = params;

  const { candidates, status } = await fetchAllSources(target, params.sources);

  if (!candidates.length) {
    return { candidates: [], picked: null, fromManualPick: false, sourceStatus: status };
  }

  // ---- 解析 ----
  const parsedCandidates: LyricsScoredCandidate[] = candidates.map(candidate => ({
    ...candidate,
    score: 0,
    reasons: [],
    parsed: parseLyrics(candidate.raw),
  }));

  // ---- 交叉印证：统计每个候选有多少「同伴」与它高度相似 ----
  const lyricsTexts = parsedCandidates.map(candidate => candidate.parsed.lines.map(line => line.text).join("\n"));
  const consensusPeers = parsedCandidates.map((_, i) => {
    let peers = 0;
    for (let j = 0; j < parsedCandidates.length; j += 1) {
      if (i === j) continue;
      if (textSimilarity(lyricsTexts[i], lyricsTexts[j]) >= CONSENSUS_THRESHOLD) peers += 1;
    }
    return peers;
  });

  // ---- 打分 ----
  const artistKey = target.artist.trim().toLowerCase();
  parsedCandidates.forEach((candidate, index) => {
    const result = scoreLyricCandidate({
      target,
      candidate,
      parsed: candidate.parsed,
      consensusPeers: consensusPeers[index],
      sourceDurationMs: candidate.durationMs,
      artistMatches: Boolean(artistKey) && candidate.artist.toLowerCase().includes(artistKey),
    });

    candidate.score = result.score;
    candidate.reasons = result.reasons;
  });

  const ranked = parsedCandidates.filter(candidate => candidate.score > 0).sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    log.warn(`[lyrics] ${trackKey}: 所有候选都被淘汰`);
    return { candidates: [], picked: null, fromManualPick: false, sourceStatus: status };
  }

  // ---- 人工选择优先 ----
  const pick = readMatchPick(trackKey);
  if (pick) {
    const manual = ranked.find(candidate => candidate.source === pick.source && candidate.id === pick.candidateId);
    if (manual) {
      return { candidates: ranked, picked: manual, fromManualPick: pick.manual, sourceStatus: status };
    }
  }

  return { candidates: ranked, picked: ranked[0], fromManualPick: false, sourceStatus: status };
}

/** 网易云歌曲直接用 id 取词，跳过搜索 */
export async function resolveNeteaseLyrics(id: number, target: LyricsMatchTarget): Promise<LyricsResolveResult> {
  const candidate = await fetchNeteaseById(id, target);
  if (!candidate) return { candidates: [], picked: null, fromManualPick: false, sourceStatus: [] };

  const parsed = parseLyrics(candidate.raw);
  const scored: LyricsScoredCandidate = { ...candidate, score: 400, reasons: ["网易云直取"], parsed };

  return {
    candidates: [scored],
    picked: scored,
    fromManualPick: false,
    sourceStatus: [{ source: "netease", ok: true, count: 1 }],
  };
}

export const getLyricsMatchPick = (trackKey: string) => readMatchPick(trackKey);

export const setLyricsMatchPick = (trackKey: string, pick: LyricsMatchRecord) => {
  lyricsMatchStore.set(trackKey, pick);
};

export const clearLyricsMatchPick = (trackKey: string) => {
  lyricsMatchStore.delete(trackKey);
};

export const translate = translateLines;
export const romanize = romanizeLines;
