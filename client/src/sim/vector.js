export class Vector2 {
    constructor(x = 0, y = 0) {
      this.x = x
      this.y = y
    }
  
    add(other) {
      return new Vector2(
        this.x + other.x,
        this.y + other.y
      )
    }
  
    sub(other) {
      return new Vector2(
        this.x - other.x,
        this.y - other.y
      )
    }
  
    scale(value) {
      return new Vector2(
        this.x * value,
        this.y * value
      )
    }
  
    length() {
      return Math.sqrt(
        this.x * this.x +
        this.y * this.y
      )
    }
  
    normalize() {
      const length = this.length()
  
      if (length === 0) {
        return new Vector2(0, 0)
      }
  
      return new Vector2(
        this.x / length,
        this.y / length
      )
    }
  
    rotate(angle) {
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
  
      return new Vector2(
        this.x * cos - this.y * sin,
        this.x * sin + this.y * cos
      )
    }
  
    dot(other) {
      return (
        this.x * other.x +
        this.y * other.y
      )
    }
  
    static fromAngle(angle, length = 1) {
      return new Vector2(
        Math.cos(angle) * length,
        Math.sin(angle) * length
      )
    }
  }