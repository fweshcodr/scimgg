import { useCallback, useState } from 'react';
import { getPresetsForEncounter } from '../data/tilePackPresets';
import type { TileMarker } from '../types/tileMarkers';
import { copyToClipboard, exportRuneLiteMarkers, importRuneLiteMarkers, readFromClipboard } from '../util/tilePackIO';

interface UseTileMarkerClipboardArgs {
  activeEncounterKind: string;
  markers: TileMarker[];
  importMarkers: (markers: TileMarker[]) => void;
}

interface UseTileMarkerClipboardReturn {
  importExportStatus: string | null;
  handleExportMarkers: () => void;
  handleExportPreset: (presetId: string) => void;
  handleImportMarkers: () => void;
}

const STATUS_TIMEOUT_MS = 3000;

export function useTileMarkerClipboard({
  activeEncounterKind,
  markers,
  importMarkers,
}: UseTileMarkerClipboardArgs): UseTileMarkerClipboardReturn {
  const [importExportStatus, setImportExportStatus] = useState<string | null>(null);

  const clearStatusSoon = useCallback(() => {
    window.setTimeout(() => setImportExportStatus(null), STATUS_TIMEOUT_MS);
  }, []);

  const handleExportMarkers = useCallback(() => {
    const json = exportRuneLiteMarkers(markers, activeEncounterKind);
    if (!json) {
      setImportExportStatus('Export not available for this encounter');
      return;
    }

    copyToClipboard(json).then((ok) => {
      setImportExportStatus(ok ? `Copied ${markers.length} markers to clipboard` : 'Failed to copy');
      clearStatusSoon();
    });
  }, [activeEncounterKind, clearStatusSoon, markers]);

  const handleExportPreset = useCallback(
    (presetId: string) => {
      const preset = getPresetsForEncounter(activeEncounterKind).find((candidate) => candidate.id === presetId);
      if (!preset) return;

      const json = exportRuneLiteMarkers(preset.markers, activeEncounterKind);
      if (!json) {
        setImportExportStatus('Export not available for this encounter');
        return;
      }

      copyToClipboard(json).then((ok) => {
        setImportExportStatus(
          ok ? `Copied ${preset.name} (${preset.markers.length} tiles) to clipboard` : 'Failed to copy',
        );
        clearStatusSoon();
      });
    },
    [activeEncounterKind, clearStatusSoon],
  );

  const handleImportMarkers = useCallback(() => {
    readFromClipboard().then((text) => {
      if (!text) {
        setImportExportStatus('Clipboard empty or access denied');
        clearStatusSoon();
        return;
      }

      const imported = importRuneLiteMarkers(text, activeEncounterKind);
      if (!imported || imported.length === 0) {
        setImportExportStatus('No valid markers found for this encounter');
        clearStatusSoon();
        return;
      }

      importMarkers(imported);
      setImportExportStatus(`Imported ${imported.length} markers`);
      clearStatusSoon();
    });
  }, [activeEncounterKind, clearStatusSoon, importMarkers]);

  return {
    importExportStatus,
    handleExportMarkers,
    handleExportPreset,
    handleImportMarkers,
  };
}
