export function drawShip(ctx, ship, alpha) {
    // Інтерполяція між попередньою та поточною позицією
    const renderX =
      ship.previousX + (ship.x - ship.previousX) * alpha
  
    const renderY =
      ship.previousY + (ship.y - ship.previousY) * alpha
  
    ctx.save()
  
    ctx.translate(renderX, renderY)
    ctx.rotate(ship.angle)
  
    // Корпус літака
    ctx.beginPath()
  
    ctx.moveTo(22, 0)
    ctx.lineTo(-14, -10)
    ctx.lineTo(-8, 0)
    ctx.lineTo(-14, 10)
    ctx.closePath()
  
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
  
    ctx.stroke()
  
    ctx.restore()
  }