import { safeExternalUrl } from "@fnd/client-sdk";
import {
  compactHistoryItem,
  evidenceLinkDescriptor as mapEvidence,
  textOnly
} from "@fnd/analysis-view-model";

export { compactHistoryItem, textOnly };

export function evidenceLinkDescriptor(item: Record<string, unknown>) {
  return {
    ...mapEvidence(item),
    url: safeExternalUrl(item && item.url)
  };
}
