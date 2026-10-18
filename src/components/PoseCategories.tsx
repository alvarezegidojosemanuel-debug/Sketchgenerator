"use client";

import type { Pose } from "@/lib/catalog/types";
import { POSE_CATEGORIES, poseCategoriesOf, type PoseCategoryMap } from "@/lib/catalog/poseCategories";

/** Filtro de poses por categoría (varias a la vez: sale la pose si está en alguna de las elegidas). */
export function CategoryFilter({ poses, cats, value, onChange }: { poses: Pose[]; cats: PoseCategoryMap; value: string[]; onChange: (v: string[]) => void }) {
  const count = (id: string) => poses.filter((p) => poseCategoriesOf(p.id, p.key, cats).includes(id)).length;
  return (
    <div className="chips cat-filter">
      <button type="button" className={`chip${value.length === 0 ? " on" : ""}`} onClick={() => onChange([])}>
        Todas · {poses.length}
      </button>
      {POSE_CATEGORIES.map((c) => {
        const n = count(c.id);
        if (!n) return null;
        const on = value.includes(c.id);
        return (
          <button key={c.id} type="button" className={`chip${on ? " on" : ""}`} onClick={() => onChange(on ? value.filter((x) => x !== c.id) : [...value, c.id])}>
            {c.icon} {c.label} · {n}
          </button>
        );
      })}
    </div>
  );
}

export function filterPoses(poses: Pose[], cats: PoseCategoryMap, value: string[]): Pose[] {
  if (!value.length) return poses;
  return poses.filter((p) => poseCategoriesOf(p.id, p.key, cats).some((c) => value.includes(c)));
}

/** Iconos de las categorías de una pose (para la miniatura). */
export function CategoryIcons({ pose, cats }: { pose: Pose; cats: PoseCategoryMap }) {
  const mine = poseCategoriesOf(pose.id, pose.key, cats);
  return (
    <span className="cat-icons" title={POSE_CATEGORIES.filter((c) => mine.includes(c.id)).map((c) => c.label).join(", ")}>
      {POSE_CATEGORIES.filter((c) => mine.includes(c.id)).map((c) => c.icon).join("")}
    </span>
  );
}
