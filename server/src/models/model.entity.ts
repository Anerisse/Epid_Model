import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Сущность «Модель эпидемии».
 *
 * Это центральное хранилище этапа 0: в отличие от старой таблицы equations,
 * которая хранила одну строку текста, здесь модель хранится в виде структуры,
 * удобной для дальнейшей работы (визуализация, параметризация, верификация).
 *
 * Поля:
 * - name       — название модели (например, «SIR» или «SEIQRD»);
 * - raw_text   — исходный текст, который ввёл пользователь (система уравнений),
 *                сохраняется «как есть», чтобы не потерять авторский ввод;
 * - structure  — разобранная структура модели в JSONB: список уравнений
 *                {variable, rhs}, обнаруженные параметры и потоки между
 *                компартментами. Её заполняет парсер на клиенте (этап 1),
 *                а сервер просто хранит и отдаёт её без изменений.
 */
@Entity('models')
export class Model {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  /** Исходный текст модели в том виде, в котором его ввёл пользователь. */
  @Column('text')
  raw_text: string;

  /**
   * Нормализованная структура модели (JSONB).
   * Пример значения:
   * {
   *   "equations": [{ "variable": "S", "rhs": "-beta * S * I / N" }, ...],
   *   "parameters": ["beta", "gamma"],
   *   "flows": [{ "from": "S", "to": "I", "formula": "beta * S * I / N" }, ...]
   * }
   */
  @Column('jsonb', { nullable: true })
  structure: object | null;

  /** Дата создания — ставится автоматически при первой записи. */
  @CreateDateColumn()
  created_at: Date;

  /** Дата последнего обновления — ставится автоматически при каждом изменении. */
  @UpdateDateColumn()
  updated_at: Date;
}
