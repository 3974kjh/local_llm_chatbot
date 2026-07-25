import type { ClaimStatus, ClaimVerification } from '$lib/types';
import { extractFirstJsonObject } from '../extractJsonObject';
import { callLlmNonStreaming, type LlmProvider } from '../llm';
import { WEB_FIRST_GROUNDING } from '../promptLocale';
import type { DraftClaim } from './answerDecomposer';

const MAX_CLAIMS_PER_BATCH = 12;

function buildVerifierSystemPrompt(hasEvidence: boolean): string {
	if (hasEvidence) {
		return `You verify factual claims against the provided source text ONLY.

${WEB_FIRST_GROUNDING}

언어: "reason" 필드는 한국어. JSON 키 이름은 영어.

RULES:
- status must be one of: supported, unsupported, contradicted, unverifiable
- supported: claim is directly supported by verbatim text in sources. evidence MUST quote the exact supporting snippet (max 200 chars).
- unsupported: sources do not mention this claim
- contradicted: sources explicitly contradict the claim
- unverifiable: sources are ambiguous or insufficient
- sourceUrl: exact URL from source text when supported/contradicted, else null
- When user-attached URLs (USER-PROVIDED / PRIORITY) conflict with web search results, prefer user-attached sources for verification
- NEVER use training knowledge to mark supported
- Return ONLY valid JSON array, no markdown

Output format:
{
  "verifications": [
    {
      "claim": "exact claim text",
      "status": "supported",
      "evidence": "verbatim quote from source",
      "sourceUrl": "https://..."
    }
  ]
}`;
	}

	return `You perform self-critique on claims when NO external sources are provided.

언어: "reason" 필드는 한국어. JSON 키 이름은 영어.

RULES:
- Without external sources, you CANNOT verify facts. Mark ALL claims as unverifiable.
- evidence must be null, sourceUrl must be null
- Return ONLY valid JSON

Output format:
{
  "verifications": [
    {
      "claim": "exact claim text",
      "status": "unverifiable",
      "evidence": null,
      "sourceUrl": null
    }
  ]
}`;
}

function parseVerifications(
	raw: string,
	claims: DraftClaim[],
	hasEvidence: boolean
): ClaimVerification[] {
	const jsonStr = extractFirstJsonObject(raw);
	if (!jsonStr) throw new Error('No JSON in verifier response');

	const parsed = JSON.parse(jsonStr) as { verifications?: unknown };
	const verifications = Array.isArray(parsed.verifications) ? parsed.verifications : [];

	const claimTexts = claims.map((c) => c.claim);
	const results: ClaimVerification[] = [];

	for (let i = 0; i < claimTexts.length; i++) {
		const expectedClaim = claimTexts[i];
		const match =
			verifications.find(
				(v) =>
					v &&
					typeof v === 'object' &&
					typeof (v as { claim?: unknown }).claim === 'string' &&
					(v as { claim: string }).claim.trim() === expectedClaim
			) ?? verifications[i];

		if (!match || typeof match !== 'object') {
			results.push({
				claim: expectedClaim,
				status: 'unverifiable',
				evidence: null,
				sourceUrl: null
			});
			continue;
		}

		const m = match as {
			claim?: unknown;
			status?: unknown;
			evidence?: unknown;
			sourceUrl?: unknown;
		};

		const statusRaw = typeof m.status === 'string' ? m.status : 'unverifiable';
		const validStatuses: ClaimStatus[] = [
			'supported',
			'unsupported',
			'contradicted',
			'unverifiable'
		];
		let status: ClaimStatus = validStatuses.includes(statusRaw as ClaimStatus)
			? (statusRaw as ClaimStatus)
			: 'unverifiable';

		let evidence =
			typeof m.evidence === 'string' && m.evidence.trim() ? m.evidence.trim() : null;
		let sourceUrl =
			typeof m.sourceUrl === 'string' && m.sourceUrl.trim() ? m.sourceUrl.trim() : null;

		if (!hasEvidence) {
			status = 'unverifiable';
			evidence = null;
			sourceUrl = null;
		}

		// Deterministic post-check: supported requires evidence
		if (status === 'supported' && !evidence) {
			status = 'unverifiable';
			sourceUrl = null;
		}

		results.push({
			claim: expectedClaim,
			status,
			evidence,
			sourceUrl
		});
	}

	return results;
}

/** Check that evidence snippet appears in source context (case-insensitive substring). */
export function evidenceExistsInContext(
	evidence: string | null,
	sourceContext: string
): boolean {
	if (!evidence || !sourceContext) return false;
	const normalizedEvidence = evidence.replace(/\s+/g, ' ').trim().toLowerCase();
	const normalizedContext = sourceContext.replace(/\s+/g, ' ').toLowerCase();
	if (normalizedEvidence.length < 8) return false;
	return normalizedContext.includes(normalizedEvidence.slice(0, Math.min(120, normalizedEvidence.length)));
}

export function applyEvidenceContextCheck(
	verifications: ClaimVerification[],
	sourceContext: string
): ClaimVerification[] {
	return verifications.map((v) => {
		if (v.status !== 'supported') return v;
		if (!evidenceExistsInContext(v.evidence, sourceContext)) {
			return { ...v, status: 'unverifiable' as const, evidence: null, sourceUrl: null };
		}
		return v;
	});
}

export function computeClaimConfidence(
	verifications: ClaimVerification[],
	hasEvidence: boolean,
	confidenceCapWithoutEvidence: number
): number {
	if (verifications.length === 0) return hasEvidence ? 0.3 : confidenceCapWithoutEvidence;

	const supported = verifications.filter((v) => v.status === 'supported').length;
	const contradicted = verifications.filter((v) => v.status === 'contradicted').length;
	const total = verifications.length;

	let confidence = supported / total;
	if (contradicted > 0) confidence *= 0.5;

	if (!hasEvidence) {
		confidence = Math.min(confidence, confidenceCapWithoutEvidence);
	}

	return Math.max(0, Math.min(1, confidence));
}

export async function verifyClaims(
	claims: DraftClaim[],
	sourceContext: string,
	hasEvidence: boolean,
	provider: LlmProvider = 'local'
): Promise<ClaimVerification[]> {
	const batch = claims.slice(0, MAX_CLAIMS_PER_BATCH);
	const claimsList = batch.map((c, i) => `${i + 1}. ${c.claim}`).join('\n');

	const userMessage = hasEvidence
		? `Source text:\n${sourceContext.slice(0, 20000)}\n\nClaims to verify:\n${claimsList}\n\nReturn JSON verifications for each claim.`
		: `No external sources attached.\n\nClaims to mark as unverifiable:\n${claimsList}\n\nReturn JSON.`;

	const raw = await callLlmNonStreaming(
		[{ role: 'user', content: userMessage }],
		buildVerifierSystemPrompt(hasEvidence),
		{ provider }
	);

	let results = parseVerifications(raw, batch, hasEvidence);
	if (hasEvidence) {
		results = applyEvidenceContextCheck(results, sourceContext);
	}

	return results;
}
