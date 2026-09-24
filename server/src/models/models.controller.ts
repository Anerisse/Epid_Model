import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Model } from './model.entity';

/**
 * Контроллер моделей эпидемии (CRUD).
 *
 * В отличие от старого /api/equations здесь мы работаем со структурированными
 * моделями: создаём их, обновляем, удаляем и получаем по отдельности.
 * Все методы возвращают JSON, который напрямую использует клиент.
 *
 * Эндпоинты:
 *   GET    /api/models      — список всех моделей (новые сверху)
 *   GET    /api/models/:id  — одна модель по id
 *   POST   /api/models      — создать модель
 *   PATCH  /api/models/:id  — обновить модель (можно частично)
 *   DELETE /api/models/:id  — удалить модель
 */
@Controller('api/models')
export class ModelsController {
  constructor(
    @InjectRepository(Model)
    private modelsRepository: Repository<Model>,
  ) {}

  /**
   * Возвращает список всех сохранённых моделей.
   * Сортировка created_at DESC нужна, чтобы в интерфейсе самые свежие
   * модели всегда показывались первыми (аналогично /api/equations).
   */
  @Get()
  findAll() {
    return this.modelsRepository.find({
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Возвращает одну модель по её числовому идентификатору.
   * Используется клиентом, когда нужно загрузить конкретную модель
   * в редактор. Если модели с таким id нет — выбрасываем 404,
   * чтобы клиент мог показать корректную ошибку.
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const model = await this.modelsRepository.findOneBy({ id: Number(id) });
    if (!model) {
      throw new NotFoundException(`Модель с id=${id} не найдена`);
    }
    return model;
  }

  /**
   * Создаёт новую модель и сохраняет её в базе данных.
   * body состоит из обязательных полей name и raw_text и необязательного
   * structure — его присылает парсер с клиента (этап 1). Здесь структуру
   * не проверяем и не изменяем: сервер хранит её «как есть».
   */
  @Post()
  create(@Body() body: { name: string; raw_text: string; structure?: object }) {
    const model = this.modelsRepository.create({
      name: body.name,
      raw_text: body.raw_text,
      structure: body.structure ?? null,
    });
    return this.modelsRepository.save(model);
  }

  /**
   * Обновляет модель целиком или частично (PATCH — значит можно прислать
   * только те поля, которые изменились). Сначала ищем модель по id —
   * если её нет, отвечаем 404. Затем переносим пришедшие поля в найденную
   * запись и сохраняем. Дата updated_at при этом обновится автоматически.
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; raw_text?: string; structure?: object },
  ) {
    const model = await this.modelsRepository.findOneBy({ id: Number(id) });
    if (!model) {
      throw new NotFoundException(`Модель с id=${id} не найдена`);
    }

    if (body.name !== undefined) {
      model.name = body.name;
    }
    if (body.raw_text !== undefined) {
      model.raw_text = body.raw_text;
    }
    if (body.structure !== undefined) {
      model.structure = body.structure;
    }

    return this.modelsRepository.save(model);
  }

  /**
   * Удаляет модель из базы данных по id.
   * Если такой модели нет — отвечаем 404, иначе удаляем и возвращаем
   * количество удалённых записей (1 в случае успеха).
   */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.modelsRepository.delete({ id: Number(id) });
    if (result.affected === 0) {
      throw new NotFoundException(`Модель с id=${id} не найдена`);
    }
    return { deleted: result.affected };
  }
}
