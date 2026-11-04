import {nativeRecallMeal} from '@/lib/db/repository/native-user-recall';

describe('diet recall rows', () => {
  it('keeps normal entries as they are', () => {
    expect(nativeRecallMeal({mealType: 'Lunch', hour: '1', minute: '30', meridian: 'PM', food: 'Dal rice'}))
      .toMatchObject({mealType: 'Lunch', hour: '1', minute: '30', meridian: 'PM', food: 'Dal rice'});
  });
  it('accepts 24-hour times and loose typing', () => {
    expect(nativeRecallMeal({mealType: 'Dinner', hour: '20', minute: '0', meridian: 'AM', food: 'Roti'}))
      .toMatchObject({hour: '8', minute: '00', meridian: 'PM'});
    expect(nativeRecallMeal({mealType: 'early morning', hour: '0', minute: '15', meridian: 'pm', food: ''}))
      .toMatchObject({mealType: 'Early Morning', hour: '12', minute: '15', meridian: 'AM'});
    expect(nativeRecallMeal({mealType: 'Mid-Morning', hour: ' 7:30 ', minute: '', meridian: '', food: 'Fruit'}))
      .toMatchObject({mealType: 'Mid Morning', hour: '7', minute: '30', meridian: 'AM'});
    expect(nativeRecallMeal({mealType: 'Breakfast', hour: 9, minute: 5, meridian: 'AM', food: null, amount: 2}))
      .toMatchObject({hour: '9', minute: '05', food: '', amount: '2'});
  });
  it('uses the meal default time when left empty', () => {
    expect(nativeRecallMeal({mealType: 'Post Dinner', hour: '', minute: '', food: 'Milk'}))
      .toMatchObject({hour: '9', minute: '00', meridian: 'PM'});
  });
  it('names the meal in the error when the time is impossible', () => {
    expect(() => nativeRecallMeal({mealType: 'Lunch', hour: '25', minute: '00', meridian: 'PM', food: ''})).toThrow('Lunch: time "25:00 PM" is not valid');
    expect(() => nativeRecallMeal({mealType: 'Lunch', hour: '1', minute: '75', meridian: 'PM', food: ''})).toThrow('Lunch');
    expect(() => nativeRecallMeal({mealType: 'Snacks', hour: '5', minute: '00', meridian: 'PM', food: ''})).toThrow('Unknown meal "Snacks"');
  });
});
