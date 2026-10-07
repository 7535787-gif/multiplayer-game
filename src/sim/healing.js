export function createHealing(amount = 25) {
    return {
      amount,
  
      apply(target) {
        target.heal(this.amount)
      },
    }
  }