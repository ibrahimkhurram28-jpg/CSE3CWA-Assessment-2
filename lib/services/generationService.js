import { prisma } from "@/lib/server/prisma";
import { UnprocessableError } from "@/lib/server/errors";
import { generateWordleHtml } from "@/lib/generateWordleHtml";
import { generateWordSearchHtml } from "@/lib/generateWordSearchHtml";
import { findActivityRecord } from "./activityService";
import { serializeWord } from "./serializers";

function defaultFileName(activity) {
  const base = activity.type === "WORDLE" ? "phonemele" : "phoneme-word-search";
  const slug = activity.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug ? `${base}-${slug}` : base;
}

/**
 * Builds the downloadable HTML for a stored activity. Everything comes from
 * the database: the settings row, the selected words and their phonemes.
 */
export async function generateActivityHtml(id, { record = true } = {}) {
  const activity = await findActivityRecord(id);
  const words = activity.words.map((link) => serializeWord(link.word));

  if (words.length === 0) {
    throw new UnprocessableError(
      "This activity has no words left. Edit it and select at least one word before downloading."
    );
  }

  const shared = {
    activityTitle: activity.title,
    showHints: activity.showHints,
    studentName: activity.authorName ?? "",
    studentNumber: activity.authorNumber ?? "",
  };

  let html;
  if (activity.type === "WORDLE") {
    html = generateWordleHtml({
      ...shared,
      words: words.map((w) => ({ phonemes: w.phonemes, english: w.english, hint: w.hint })),
      numGuesses: activity.maxGuesses ?? 6,
    });
  } else {
    html = generateWordSearchHtml({
      ...shared,
      words: words.map((w) => ({ phonemes: w.phonemes, english: w.english, hint: w.hint })),
      size: activity.gridSize ?? 10,
      allowDiagonal: activity.allowDiagonal ?? true,
      allowBackwards: activity.allowBackwards ?? false,
    });
  }

  const fileName = `${activity.fileName || defaultFileName(activity)}.html`;
  const byteSize = Buffer.byteLength(html, "utf8");

  if (record) {
    await prisma.generationLog.create({
      data: { activityId: activity.id, fileName, wordCount: words.length, byteSize },
    });
  }

  return { html, fileName, byteSize, wordCount: words.length };
}
