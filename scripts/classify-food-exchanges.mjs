import fs from "node:fs";
import path from "node:path";

const [inputPath, outputPath, reviewPath] = process.argv.slice(2);
if (!inputPath || !outputPath || !reviewPath) {
  throw new Error("Uso: node classify-food-exchanges.mjs entrada.json salida.json revision.json");
}

const foods = JSON.parse(fs.readFileSync(inputPath, "utf8"));
if (!Array.isArray(foods)) throw new Error("El JSON debe contener un array");

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const subgroupOf = (food) =>
  normalize(food.subgrupo ?? food.subgroup ?? food.subgrup ?? food.sub_group);

const n = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const result = (category, confidence, reason) => ({ category, confidence, reason });

const proteinExchangeCategory = (food) => {
  const protein = n(food.prot_100g);
  const fat = n(food.fat_100g);
  if (protein <= 0) return result(null, "low", "Proteína principal igual a cero");
  const fatPerSevenProtein = (fat / protein) * 7;
  if (fatPerSevenProtein <= 1) {
    return result("lean_protein", "high", "≤1 g de grasa por cada 7 g de proteína");
  }
  if (fatPerSevenProtein <= 3.5) {
    return result("semi_fat_protein", "high", "1–3.5 g de grasa por cada 7 g de proteína");
  }
  return result("fat_protein", "high", ">3.5 g de grasa por cada 7 g de proteína");
};

const dairyCategory = (food) => {
  const name = normalize(food.name);
  const protein = n(food.prot_100g);
  const carbs = n(food.cho_100g);
  const fat = n(food.fat_100g);

  if (/(queso|mozzarella|parmesano|cheddar|feta|requeson)/.test(name)) {
    const classified = proteinExchangeCategory(food);
    return result(classified.category, "medium", "Lácteo sólido clasificado por grasa/proteína");
  }
  if (protein >= 7 && carbs <= 8 && fat <= 2) {
    return result("protein_dairy", "high", "Lácteo alto en proteína y bajo en grasa");
  }
  if (fat >= 3) return result("whole_dairy", "high", "Lácteo con ≥3 g de grasa");
  if (fat >= 1) return result("semi_dairy", "high", "Lácteo con 1–3 g de grasa");
  return result("skim_dairy", "high", "Lácteo con <1 g de grasa");
};

const classify = (food) => {
  const group = normalize(food.group);
  const subgroup = subgroupOf(food);
  const name = normalize(food.name);
  const carbs = n(food.cho_100g);
  const protein = n(food.prot_100g);
  const fat = n(food.fat_100g);

  if (subgroup.includes("lacteo") || /(leche|yogur|kefir|skyr|queso|requeson)/.test(name)) {
    return dairyCategory(food);
  }
  if (subgroup.includes("legumbre") || subgroup === "untable_legumbre") {
    return result("legumes", "high", "Subgrupo de legumbres");
  }
  if (
    subgroup === "fruta" ||
    subgroup.startsWith("fruta_") ||
    subgroup === "tuberculo_fruta" ||
    subgroup === "producto_infantil"
  ) {
    return result("fruit", subgroup === "producto_infantil" ? "medium" : "high", "Subgrupo de fruta");
  }
  if (group === "vegetales" || subgroup === "vegetales") {
    return result("vegetables", "high", "Grupo o subgrupo de vegetales");
  }
  if (
    subgroup === "carb_simple" ||
    subgroup === "dulce" ||
    /(azucar|miel|mermelada|membrillo|napolitana|croissant)/.test(name)
  ) {
    return result("sugars", "high", "Azúcar o dulce");
  }
  if (group === "proteinas") return proteinExchangeCategory(food);
  if (group === "grasas") {
    if (subgroup === "huevo" || subgroup === "embutido") {
      const classified = proteinExchangeCategory(food);
      return result(classified.category, "medium", "Alimento graso con proteína relevante");
    }
    return result("fats", "high", "Grupo principal de grasas");
  }
  if (group === "carbohidratos") {
    return result(
      "cereals",
      subgroup ? "high" : "medium",
      subgroup ? "Subgrupo de cereal, tubérculo o derivado" : "Carbohidrato sin subgrupo",
    );
  }
  if (group === "extras") {
    if (carbs >= 5 && protein < 5) {
      return result("sugars", "medium", "Extra con aporte principalmente de carbohidratos");
    }
    return result(null, "low", "Extra sin equivalencia clara en FOOD_CATEGORY_EXCHANGES");
  }
  if (group === "otros" || !group) {
    if (protein >= 7) return proteinExchangeCategory(food);
    if (fat >= carbs && fat >= 5) {
      return result("fats", "low", "Grupo no normalizado; grasa como macro dominante");
    }
    if (carbs >= 10) {
      return result("cereals", "low", "Grupo no normalizado; carbohidrato como macro dominante");
    }
    return result(null, "low", "Grupo no reconocido y sin macro dominante");
  }
  return result(null, "low", "No coincide con ninguna regla");
};

const review = [];
const enriched = foods.map((food) => {
  const classification = classify(food);
  if (classification.confidence === "low" || !classification.category) {
    review.push({
      id: food?._id?.$oid ?? food?._id ?? null,
      name: food.name,
      group: food.group ?? null,
      subgroup: subgroupOf(food) || null,
      proposedMealCategory: classification.category,
      reason: classification.reason,
      macrosPer100g: {
        protein: n(food.prot_100g),
        carbs: n(food.cho_100g),
        fat: n(food.fat_100g),
      },
    });
  }
  return {
    ...food,
    mealCategory: classification.category,
  };
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(path.dirname(reviewPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(enriched, null, 2)}\n`, "utf8");
fs.writeFileSync(reviewPath, `${JSON.stringify(review, null, 2)}\n`, "utf8");

const counts = enriched.reduce((acc, food) => {
  const key = food.mealCategory ?? "<sin_categoria>";
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});

process.stdout.write(
  JSON.stringify(
    {
      total: enriched.length,
      review: review.length,
      counts,
      outputPath,
      reviewPath,
    },
    null,
    2,
  ),
);
