/**
 * Periodic-table element data: atomic number, symbol, grid position (group 1–18, period 1–7; the
 * f-block lanthanides/actinides use display periods 8/9), and a category for coloring. Vendored +
 * frozen, so the table is deterministic. Feeds periodicTable() (and future electron-config builders).
 */

export type ElementCategory =
  "nonmetal" | "noble" | "alkali" | "alkaline" | "metalloid" | "halogen" | "transition" | "post-transition" | "lanthanide" | "actinide";

export interface Element {
  z: number;
  sym: string;
  /** 1–18. */
  group: number;
  /** 1–7 for the main grid; 8 = lanthanides, 9 = actinides (drawn as the f-block rows). */
  period: number;
  category: ElementCategory;
}

/** Soft category colors (light fills with readable dark text). */
export const CATEGORY_COLOR: Record<ElementCategory, string> = {
  nonmetal: "#86efac",
  noble: "#a5b4fc",
  alkali: "#fca5a5",
  alkaline: "#fdba74",
  metalloid: "#5eead4",
  halogen: "#7dd3fc",
  transition: "#fde68a",
  "post-transition": "#d8b4fe",
  lanthanide: "#f9a8d4",
  actinide: "#fbcfe8",
};

type Row = [number, string, number, number, ElementCategory];
// prettier-ignore
const DATA: Row[] = [
  [1,"H",1,1,"nonmetal"],[2,"He",18,1,"noble"],
  [3,"Li",1,2,"alkali"],[4,"Be",2,2,"alkaline"],[5,"B",13,2,"metalloid"],[6,"C",14,2,"nonmetal"],[7,"N",15,2,"nonmetal"],[8,"O",16,2,"nonmetal"],[9,"F",17,2,"halogen"],[10,"Ne",18,2,"noble"],
  [11,"Na",1,3,"alkali"],[12,"Mg",2,3,"alkaline"],[13,"Al",13,3,"post-transition"],[14,"Si",14,3,"metalloid"],[15,"P",15,3,"nonmetal"],[16,"S",16,3,"nonmetal"],[17,"Cl",17,3,"halogen"],[18,"Ar",18,3,"noble"],
  [19,"K",1,4,"alkali"],[20,"Ca",2,4,"alkaline"],[21,"Sc",3,4,"transition"],[22,"Ti",4,4,"transition"],[23,"V",5,4,"transition"],[24,"Cr",6,4,"transition"],[25,"Mn",7,4,"transition"],[26,"Fe",8,4,"transition"],[27,"Co",9,4,"transition"],[28,"Ni",10,4,"transition"],[29,"Cu",11,4,"transition"],[30,"Zn",12,4,"transition"],[31,"Ga",13,4,"post-transition"],[32,"Ge",14,4,"metalloid"],[33,"As",15,4,"metalloid"],[34,"Se",16,4,"nonmetal"],[35,"Br",17,4,"halogen"],[36,"Kr",18,4,"noble"],
  [37,"Rb",1,5,"alkali"],[38,"Sr",2,5,"alkaline"],[39,"Y",3,5,"transition"],[40,"Zr",4,5,"transition"],[41,"Nb",5,5,"transition"],[42,"Mo",6,5,"transition"],[43,"Tc",7,5,"transition"],[44,"Ru",8,5,"transition"],[45,"Rh",9,5,"transition"],[46,"Pd",10,5,"transition"],[47,"Ag",11,5,"transition"],[48,"Cd",12,5,"transition"],[49,"In",13,5,"post-transition"],[50,"Sn",14,5,"post-transition"],[51,"Sb",15,5,"metalloid"],[52,"Te",16,5,"metalloid"],[53,"I",17,5,"halogen"],[54,"Xe",18,5,"noble"],
  [55,"Cs",1,6,"alkali"],[56,"Ba",2,6,"alkaline"],[72,"Hf",4,6,"transition"],[73,"Ta",5,6,"transition"],[74,"W",6,6,"transition"],[75,"Re",7,6,"transition"],[76,"Os",8,6,"transition"],[77,"Ir",9,6,"transition"],[78,"Pt",10,6,"transition"],[79,"Au",11,6,"transition"],[80,"Hg",12,6,"transition"],[81,"Tl",13,6,"post-transition"],[82,"Pb",14,6,"post-transition"],[83,"Bi",15,6,"post-transition"],[84,"Po",16,6,"post-transition"],[85,"At",17,6,"halogen"],[86,"Rn",18,6,"noble"],
  [87,"Fr",1,7,"alkali"],[88,"Ra",2,7,"alkaline"],[104,"Rf",4,7,"transition"],[105,"Db",5,7,"transition"],[106,"Sg",6,7,"transition"],[107,"Bh",7,7,"transition"],[108,"Hs",8,7,"transition"],[109,"Mt",9,7,"transition"],[110,"Ds",10,7,"transition"],[111,"Rg",11,7,"transition"],[112,"Cn",12,7,"transition"],[113,"Nh",13,7,"post-transition"],[114,"Fl",14,7,"post-transition"],[115,"Mc",15,7,"post-transition"],[116,"Lv",16,7,"post-transition"],[117,"Ts",17,7,"halogen"],[118,"Og",18,7,"noble"],
  // Lanthanides (display period 8, group 3..17) and actinides (period 9).
  [57,"La",3,8,"lanthanide"],[58,"Ce",4,8,"lanthanide"],[59,"Pr",5,8,"lanthanide"],[60,"Nd",6,8,"lanthanide"],[61,"Pm",7,8,"lanthanide"],[62,"Sm",8,8,"lanthanide"],[63,"Eu",9,8,"lanthanide"],[64,"Gd",10,8,"lanthanide"],[65,"Tb",11,8,"lanthanide"],[66,"Dy",12,8,"lanthanide"],[67,"Ho",13,8,"lanthanide"],[68,"Er",14,8,"lanthanide"],[69,"Tm",15,8,"lanthanide"],[70,"Yb",16,8,"lanthanide"],[71,"Lu",17,8,"lanthanide"],
  [89,"Ac",3,9,"actinide"],[90,"Th",4,9,"actinide"],[91,"Pa",5,9,"actinide"],[92,"U",6,9,"actinide"],[93,"Np",7,9,"actinide"],[94,"Pu",8,9,"actinide"],[95,"Am",9,9,"actinide"],[96,"Cm",10,9,"actinide"],[97,"Bk",11,9,"actinide"],[98,"Cf",12,9,"actinide"],[99,"Es",13,9,"actinide"],[100,"Fm",14,9,"actinide"],[101,"Md",15,9,"actinide"],[102,"No",16,9,"actinide"],[103,"Lr",17,9,"actinide"],
];

export const ELEMENTS: readonly Element[] = DATA.map(([z, sym, group, period, category]) => ({ z, sym, group, period, category }));
