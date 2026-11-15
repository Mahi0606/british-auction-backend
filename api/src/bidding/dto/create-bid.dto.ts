import {
  IsDateString,
  IsNumber,
  IsString,
  Min,
  IsNotEmpty,
} from 'class-validator';

export class CreateBidDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  freightCharges: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  originCharges: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  destinationCharges: number;

  @IsString()
  @IsNotEmpty()
  transitTime: string;

  @IsDateString()
  validity: string;
}