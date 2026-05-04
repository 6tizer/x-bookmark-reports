"use client";

/**
 * useSettings — Settings CRUD
 */

import { useCallback, useEffect } from "react";
import { useSettingsStore } from "@/store/useSettingsStore";
import { getSettings, updateSettings, updateApiKey, testConnection } from "@/lib/api";
import type { Settings, UpdateSettingsRequest, UpdateApiKeyRequest } from "@/types/api";

interface UseSettingsReturn {
  settings: Settings | null;
  isLoading: boolean;
  isSaving: boolean;

  fetchSettings: () => Promise<void>;
  update: (request: UpdateSettingsRequest) => Promise<void>;
  updateKey: (request: UpdateApiKeyRequest) => Promise<void>;
  test: () => Promise<{ reachable: boolean; latency: number }>;
}

export function useSettings(): UseSettingsReturn {
  const store = useSettingsStore();

  const fetchSettings = useCallback(async () => {
    store.setIsLoading(true);
    try {
      const res = await getSettings();
      store.setSettings(res);
    } finally {
      store.setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const update = useCallback(
    async (request: UpdateSettingsRequest) => {
      store.setIsSaving(true);
      try {
        const res = await updateSettings(request);
        store.setSettings(res);
      } finally {
        store.setIsSaving(false);
      }
    },
    [store]
  );

  const updateKey = useCallback(
    async (request: UpdateApiKeyRequest) => {
      store.setIsSaving(true);
      try {
        await updateApiKey(request);
        await fetchSettings();
      } finally {
        store.setIsSaving(false);
      }
    },
    [store, fetchSettings]
  );

  const test = useCallback(async () => {
    return await testConnection();
  }, []);

  return {
    settings: store.settings,
    isLoading: store.isLoading,
    isSaving: store.isSaving,
    fetchSettings,
    update,
    updateKey,
    test,
  };
}
