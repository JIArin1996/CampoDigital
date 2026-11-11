"use client"

import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"

import { cn } from "@/lib/utils"

// Menú desplegable (base-ui): ↑ ↓ para moverse, Enter elige, Esc cierra; el foco vuelve al botón.

function Menu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="menu" {...props} />
}

function MenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />
}

function MenuContent({ className, align = "end", sideOffset = 4, ...props }: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, "align" | "sideOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner align={align} sideOffset={sideOffset} className="isolate z-50">
        <MenuPrimitive.Popup data-slot="menu-content"
          className={cn("z-50 min-w-48 origin-(--transform-origin) rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95", className)}
          {...props} />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function MenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item data-slot="menu-item"
      className={cn("flex cursor-default items-start gap-2 rounded-md px-2 py-1.5 outline-none select-none data-highlighted:bg-secondary data-highlighted:text-secondary-foreground data-disabled:cursor-not-allowed data-disabled:text-muted-foreground [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0", className)}
      {...props} />
  )
}

function MenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="menu-group" {...props} />
}

function MenuGroupLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return <MenuPrimitive.GroupLabel data-slot="menu-group-label"
    className={cn("px-2 pt-1.5 pb-1 text-[11px] font-bold tracking-wide text-muted-foreground uppercase", className)} {...props} />
}

function MenuSeparator({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator data-slot="menu-separator" className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />
}

export { Menu, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator, MenuTrigger }
