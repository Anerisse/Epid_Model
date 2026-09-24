import { Controller, Get, Post, Body } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Equation } from './equation.entity';

@Controller('api/equations')
export class EquationsController {
  constructor(
    @InjectRepository(Equation)
    private equationsRepository: Repository<Equation>,
  ) {}

  @Get()
  findAll() {
    return this.equationsRepository.find({
      order: { created_at: 'DESC' },
    });
  }

  @Post()
  create(@Body() body: { name: string; equation_text: string }) {
    const equation = this.equationsRepository.create(body);
    return this.equationsRepository.save(equation);
  }
}
