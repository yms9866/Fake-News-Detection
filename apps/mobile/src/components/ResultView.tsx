import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { evidenceLinkDescriptor, toAnalysisDisplayModel } from "@fnd/analysis-view-model";
import { Badge } from "./Badge";
import { CollapsibleSection } from "./CollapsibleSection";
import { EmptyState } from "./EmptyState";
import { Panel } from "./Panel";
import { SourceRow } from "./SourceRow";
import { VerdictBanner } from "./VerdictBanner";
import { space, type, useTheme } from "../theme";

type ResultViewProps = {
  result: Record<string, unknown> | null;
};

function valueOrDash(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export function ResultView({ result }: ResultViewProps) {
  const { colors } = useTheme();
  const display = toAnalysisDisplayModel(result);

  if (!display) {
    return (
      <EmptyState
        title="No analysis selected"
        message="Submit text or a URL to see the final verdict and reviewed evidence."
      />
    );
  }

  const claims = Array.isArray(display.claims) ? display.claims.slice(0, 8) : [];
  const sources = Array.isArray(display.sources) ? display.sources.slice(0, 8) : [];
  const searchSummary =
    display.searchSummary && typeof display.searchSummary === "object"
      ? (display.searchSummary as Record<string, unknown>)
      : null;
  const gemini =
    display.geminiEvidence && typeof display.geminiEvidence === "object"
      ? (display.geminiEvidence as Record<string, unknown>)
      : null;

  return (
    <View style={styles.stack}>
      <VerdictBanner
        verdict={display.finalVerdict}
        confidence={display.confidence}
        reason={display.reason}
        warning={display.warnings[0]}
      />

      <CollapsibleSection title="How we checked this" initiallyOpen>
        <Panel style={styles.nested}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Writing style</Text>
          <View style={styles.badgeRow}>
            <Badge label={valueOrDash(display.styleSignal)} tone="accent" />
            <Badge label={`${valueOrDash(display.styleConfidence)} confidence`} />
          </View>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{display.styleLimitation}</Text>
        </Panel>

        <Panel style={styles.nested}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Claims</Text>
          {claims.length === 0 ? (
            <Text style={[styles.body, { color: colors.textMuted }]}>No atomic claims were returned.</Text>
          ) : (
            claims.map((claim, index) => {
              const item = claim as Record<string, unknown>;
              return (
                <View key={index} style={[styles.claim, { borderColor: colors.borderSubtle }]}>
                  <Text style={[styles.meta, { color: colors.textMuted }]}>{`Claim ${index + 1}`}</Text>
                  <Text style={[styles.body, { color: colors.textPrimary }]}>
                    {valueOrDash(item.claim_text)}
                  </Text>
                  <View style={styles.badgeRow}>
                    <Badge label={valueOrDash(item.verification_status)} />
                    <Badge label={`${valueOrDash(item.confidence)} confidence`} />
                  </View>
                </View>
              );
            })
          )}
        </Panel>

        <Panel style={styles.nested}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Gemini Google Search</Text>
          {searchSummary ? (
            <>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                {valueOrDash(
                  searchSummary.scope ||
                    "Gemini searches the live public web with Google Search grounding."
                )}
              </Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {`${Number(searchSummary.total_queries || 0)} searches · ${Number(searchSummary.total_results || 0)} grounded results · ${Number(searchSummary.reviewed_source_count || 0)} cited sources`}
              </Text>
            </>
          ) : (
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Gemini Google Search grounding was not run.
            </Text>
          )}
        </Panel>

        <View style={styles.sources}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Reviewed sources</Text>
          {sources.length === 0 ? (
            <Text style={[styles.body, { color: colors.textMuted }]}>No structured source records were returned.</Text>
          ) : (
            sources.map((source, index) => {
              const item = source as Record<string, unknown>;
              const descriptor = evidenceLinkDescriptor(item);
              return (
                <SourceRow
                  key={index}
                  title={String(item.title || descriptor.domain || "Untitled source")}
                  domain={descriptor.domain || String(item.domain || "")}
                  stance={descriptor.stance || String(item.stance || "")}
                  reliability={String(item.reliability || "")}
                  url={descriptor.url || String(item.url || "")}
                  explanation={String(item.qualification_explanation || item.fetch_message || "")}
                />
              );
            })
          )}
        </View>

        <Panel style={styles.nested}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Gemini evidence analysis</Text>
          {gemini ? (
            <>
              <Text style={[styles.body, { color: colors.textPrimary }]}>
                {`${valueOrDash(gemini.assessment || gemini.verdict)} · ${valueOrDash(gemini.confidence)} confidence`}
              </Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {`Evidence quality: ${valueOrDash(gemini.evidence_quality)}`}
              </Text>
              {gemini.explanation ? (
                <Text style={[styles.body, { color: colors.textSecondary }]}>
                  {String(gemini.explanation)}
                </Text>
              ) : null}
              {gemini.error_message || gemini.error ? (
                <Text style={[styles.body, { color: colors.statusUncertainText }]}>
                  {String(gemini.error_message || gemini.error)}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Evidence verification was not performed for this analysis.
            </Text>
          )}
        </Panel>

        {display.warnings.length > 0 ? (
          <Panel style={styles.nested}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Warnings</Text>
            {display.warnings.map((warning, index) => (
              <Text key={`${warning}-${index}`} style={[styles.body, { color: colors.statusUncertainText }]}>
                {warning}
              </Text>
            ))}
          </Panel>
        ) : null}
      </CollapsibleSection>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space.lg
  },
  nested: {
    gap: space.sm,
    padding: space.md
  },
  sectionTitle: {
    ...type.label,
    fontSize: 15
  },
  body: {
    ...type.body
  },
  meta: {
    ...type.body,
    fontSize: 12
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm
  },
  claim: {
    borderLeftWidth: 3,
    gap: space.xs,
    paddingLeft: space.md,
    paddingVertical: space.sm
  },
  sources: {
    gap: space.md
  }
});
