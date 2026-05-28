/**
 * Tests for lib/ctc_llm_analysis.js — Sprint 2c extraction.
 *
 * Covers the HIGH-3 hardening that prompted the module split:
 *   - hasQuota() returns false when below QUOTA_RESERVE_THRESHOLD
 *   - analyzeTranscript skips the LLM call + returns fallback when quota is low
 *   - analyzeTranscript catches llm.generateText exceptions and returns fallback
 *   - analyzeTranscript catches JSON parse failures and returns fallback w/ raw text
 *   - Output ALWAYS conforms to FALLBACK_ANALYSIS shape (no undefined fields)
 */

import llmAnalysis from 'SuiteScripts/lib/ctc_llm_analysis';
import llm from 'N/llm';
import log from 'N/log';

jest.mock('N/llm');
jest.mock('N/log');

describe('ctc_llm_analysis', () => {

    const MOCK_OK = {
        title: 'Demo went well',
        brief: 'Sending pricing Tuesday',
        summary: 'Demo of product features went smoothly.',
        satisfaction_score: 8,
        tone_keywords: ['positive', 'engaged'],
        action_items: ['Send pricing']
    };

    beforeEach(() => {
        jest.clearAllMocks();
        llm.ModelFamily = { COHERE_COMMAND: 'COHERE_COMMAND' };
        llm.getRemainingFreeUsage = jest.fn().mockReturnValue(100);
        llm.generateText = jest.fn().mockReturnValue({ text: JSON.stringify(MOCK_OK) });
    });

    describe('exported constants (tuning surface)', () => {
        it('exports ANALYSIS_PROMPT_PREFIX with the JSON output schema', () => {
            expect(llmAnalysis.ANALYSIS_PROMPT_PREFIX).toContain('sales call analyst');
            expect(llmAnalysis.ANALYSIS_PROMPT_PREFIX).toContain('"title"');
            expect(llmAnalysis.ANALYSIS_PROMPT_PREFIX).toContain('"satisfaction_score"');
            expect(llmAnalysis.ANALYSIS_PROMPT_PREFIX).toContain('SCORING GUIDE');
        });

        it('exports DEFAULT_MODEL_PARAMS with COHERE_COMMAND defaults', () => {
            expect(llmAnalysis.DEFAULT_MODEL_PARAMS).toEqual({
                modelFamily: 'COHERE_COMMAND',
                modelParameters: { temperature: 0.2, maxTokens: 800 }
            });
        });

        it('exports FALLBACK_ANALYSIS with all six output fields', () => {
            expect(llmAnalysis.FALLBACK_ANALYSIS).toEqual({
                title: '',
                brief: '',
                summary: '',
                satisfaction_score: 5,
                tone_keywords: [],
                action_items: []
            });
        });

        it('exports QUOTA_RESERVE_THRESHOLD at 10', () => {
            expect(llmAnalysis.QUOTA_RESERVE_THRESHOLD).toBe(10);
        });
    });

    describe('hasQuota', () => {
        it('returns true when getRemainingFreeUsage >= threshold', () => {
            llm.getRemainingFreeUsage.mockReturnValue(100);
            expect(llmAnalysis.hasQuota()).toBe(true);
        });

        it('returns true at the threshold boundary (10)', () => {
            llm.getRemainingFreeUsage.mockReturnValue(10);
            expect(llmAnalysis.hasQuota()).toBe(true);
        });

        it('returns false just below threshold', () => {
            llm.getRemainingFreeUsage.mockReturnValue(9);
            expect(llmAnalysis.hasQuota()).toBe(false);
        });

        it('returns false when getRemainingFreeUsage throws', () => {
            llm.getRemainingFreeUsage.mockImplementation(() => { throw new Error('quota probe failed'); });
            expect(llmAnalysis.hasQuota()).toBe(false);
        });
    });

    describe('analyzeTranscript — happy path', () => {
        it('calls llm.generateText with prompt + default model params', () => {
            llmAnalysis.analyzeTranscript('rep+customer turns here');

            expect(llm.generateText).toHaveBeenCalledWith(expect.objectContaining({
                modelFamily: 'COHERE_COMMAND',
                modelParameters: { temperature: 0.2, maxTokens: 800 }
            }));
            expect(llm.generateText.mock.calls[0][0].prompt).toContain('rep+customer turns here');
            expect(llm.generateText.mock.calls[0][0].prompt).toContain('sales call analyst');
        });

        it('returns parsed JSON merged into fallback shape', () => {
            const result = llmAnalysis.analyzeTranscript('test');
            expect(result).toEqual(MOCK_OK);
        });

        it('strips markdown code fences from response.text before parsing', () => {
            llm.generateText.mockReturnValue({
                text: '```json\n' + JSON.stringify(MOCK_OK) + '\n```'
            });
            const result = llmAnalysis.analyzeTranscript('test');
            expect(result.summary).toBe(MOCK_OK.summary);
        });

        it('honors per-call opts override', () => {
            llmAnalysis.analyzeTranscript('test', {
                modelParameters: { temperature: 0.5, maxTokens: 400 }
            });
            expect(llm.generateText).toHaveBeenCalledWith(expect.objectContaining({
                modelParameters: { temperature: 0.5, maxTokens: 400 }
            }));
        });
    });

    describe('HIGH-3: hardening against silent transcript loss', () => {
        it('SKIPS llm.generateText and returns fallback when quota is below reserve', () => {
            llm.getRemainingFreeUsage.mockReturnValue(5);

            const result = llmAnalysis.analyzeTranscript('test');

            expect(llm.generateText).not.toHaveBeenCalled();
            expect(result).toEqual(llmAnalysis.FALLBACK_ANALYSIS);
            expect(log.audit).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC LLM quota below reserve' })
            );
        });

        it('CATCHES llm.generateText exceptions and returns fallback', () => {
            llm.generateText.mockImplementation(() => {
                throw new Error('Model unavailable');
            });

            const result = llmAnalysis.analyzeTranscript('test');

            expect(result).toEqual(llmAnalysis.FALLBACK_ANALYSIS);
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC LLM call failed' })
            );
        });

        it('CATCHES JSON parse failures and returns fallback with raw text in summary', () => {
            llm.generateText.mockReturnValue({ text: 'not json' });

            const result = llmAnalysis.analyzeTranscript('test');

            expect(result.satisfaction_score).toBe(5);
            expect(result.tone_keywords).toEqual([]);
            expect(result.action_items).toEqual([]);
            expect(result.summary).toBe('not json');
            expect(log.audit).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC LLM JSON Parse Failed' })
            );
        });

        it('always returns an object with all 6 keys (no undefined leaking to writePhoneCallEnrichmentFields)', () => {
            // Partial LLM response — missing brief and tone_keywords
            llm.generateText.mockReturnValue({ text: JSON.stringify({
                title: 'partial', summary: 'partial summary', satisfaction_score: 7
            }) });

            const result = llmAnalysis.analyzeTranscript('test');

            // Missing fields should come from FALLBACK_ANALYSIS, not be undefined
            expect(result.brief).toBe('');
            expect(result.tone_keywords).toEqual([]);
            expect(result.action_items).toEqual([]);
            expect(result.title).toBe('partial');
        });

        it('returns fallback (not throw) when response is null', () => {
            llm.generateText.mockReturnValue(null);

            const result = llmAnalysis.analyzeTranscript('test');

            expect(result.satisfaction_score).toBe(5);
            expect(result.tone_keywords).toEqual([]);
        });
    });
});
