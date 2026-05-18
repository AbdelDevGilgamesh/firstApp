export type FoodEntry = {
  id: string;
  name: string;
  calories: number;
  quantity?: string;
  date: string;
  createdAt: string;
};

export type DaySummary = {
  date: string;
  totalCalories: number;
  entries: FoodEntry[];
};
