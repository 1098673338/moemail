"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

const SlidingTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => {
  const [activeIndex, setActiveIndex] = React.useState(0)
  
  const combinedRef = React.useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const updateActiveIndex = () => {
        const triggers = node.querySelectorAll('[data-state="active"]')
        if (triggers.length > 0) {
          const allTriggers = node.querySelectorAll('[role="tab"]')
          const activeElement = triggers[0]
          const index = Array.from(allTriggers).indexOf(activeElement)
          if (index >= 0) {
            setActiveIndex(index)
          }
        }
      }

      setTimeout(updateActiveIndex, 0)
      
      const observer = new MutationObserver(updateActiveIndex)
      observer.observe(node, {
        attributes: true,
        attributeFilter: ['data-state'],
        subtree: true
      })
      
      return () => observer.disconnect()
    }
    
    if (typeof ref === 'function') {
      ref(node)
    }
  }, [ref])
  
  const childrenArray = React.Children.toArray(children)
  const tabCount = childrenArray.length
  const tabWidth = `calc((100% - 0.5rem) / ${tabCount})`
  
  return (
    <TabsPrimitive.List
      ref={combinedRef}
      className={cn(
        "relative flex w-full bg-muted rounded-lg p-1 h-auto",
        className
      )}
      {...props}
    >
      <div 
        className="absolute top-1 bottom-1 bg-background rounded-md transition-all duration-300 ease-in-out"
        style={{
          width: tabWidth,
          left: "0.25rem",
          transform: `translateX(${activeIndex * 100}%)`
        }}
      />
      {children}
    </TabsPrimitive.List>
  )
})
SlidingTabsList.displayName = "SlidingTabsList"

const SlidingTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative z-10 flex-1 h-8 gap-1.5 flex items-center justify-center text-sm font-medium transition-colors duration-200 rounded-md px-2 py-2 data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
      className
    )}
    {...props}
  />
))
SlidingTabsTrigger.displayName = "SlidingTabsTrigger"

export { Tabs, TabsList, TabsTrigger, TabsContent, SlidingTabsList, SlidingTabsTrigger } 
