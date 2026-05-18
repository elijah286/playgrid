"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listUserRouteTemplatesAction,
  createUserRouteTemplateAction,
  renameUserRouteTemplateAction,
  deleteUserRouteTemplateAction,
} from "@/app/actions/user-route-templates";
import { normalizeRouteToTemplate } from "@/domain/play/userRouteTemplates";
import type { UserRouteTemplate } from "@/domain/play/userRouteTemplates";
import type { Point2, Route } from "@/domain/play/types";

export type UserRouteTemplatesHook = {
  templates: UserRouteTemplate[];
  loaded: boolean;
  save: (
    route: Route,
    playerPosition: Point2,
    name: string,
  ) => Promise<{ ok: true; template: UserRouteTemplate } | { ok: false; error: string }>;
  rename: (
    id: string,
    name: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  remove: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export function useUserRouteTemplates(): UserRouteTemplatesHook {
  const [templates, setTemplates] = useState<UserRouteTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listUserRouteTemplatesAction().then((res) => {
      if (cancelled) return;
      if (res.ok) setTemplates(res.data);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback<UserRouteTemplatesHook["save"]>(
    async (route, playerPosition, name) => {
      const norm = normalizeRouteToTemplate(route, playerPosition);
      const res = await createUserRouteTemplateAction({
        name,
        points: norm.points,
        shapes: norm.shapes,
        strokePatterns: norm.strokePatterns,
        style: norm.style,
      });
      if (!res.ok) return res;
      // Prepend so the newest template sits at the top of "Your routes".
      setTemplates((prev) => [res.data, ...prev]);
      return { ok: true, template: res.data };
    },
    [],
  );

  const rename = useCallback<UserRouteTemplatesHook["rename"]>(async (id, name) => {
    const res = await renameUserRouteTemplateAction(id, name);
    if (!res.ok) return res;
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name: res.data.name } : t)),
    );
    return { ok: true };
  }, []);

  const remove = useCallback<UserRouteTemplatesHook["remove"]>(async (id) => {
    const res = await deleteUserRouteTemplateAction(id);
    if (!res.ok) return res;
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    return { ok: true };
  }, []);

  return { templates, loaded, save, rename, remove };
}
