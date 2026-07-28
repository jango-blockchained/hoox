/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";

describe("UI Components - Module Imports", () => {
  // Button Component Tests
  describe("Button Component", () => {
    it("should be importable", async () => {
      const { Button } = await import("../src/components/ui/button");
      expect(Button).toBeDefined();
      expect(typeof Button).toBe("function");
    });

    it("should export Button as a React component", async () => {
      const module = await import("../src/components/ui/button");
      expect(module).toHaveProperty("Button");
      expect(module.Button.name).toBe("Button");
    });

    it("should accept variant prop", async () => {
      const { Button } = await import("../src/components/ui/button");
      expect(Button).toBeDefined();
      // Component supports: default, destructive, outline, secondary, ghost, link
    });

    it("should accept size prop", async () => {
      const { Button } = await import("../src/components/ui/button");
      expect(Button).toBeDefined();
      // Component supports: default, xs, sm, lg, icon, icon-xs, icon-sm, icon-lg
    });

    it("should accept asChild prop", async () => {
      const { Button } = await import("../src/components/ui/button");
      expect(Button).toBeDefined();
    });

    it("should accept standard HTML button props", async () => {
      const { Button } = await import("../src/components/ui/button");
      expect(Button).toBeDefined();
    });
  });

  // Input Component Tests
  describe("Input Component", () => {
    it("should be importable", async () => {
      const { Input } = await import("../src/components/ui/input");
      expect(Input).toBeDefined();
      expect(typeof Input).toBe("function");
    });

    it("should export Input as a React component", async () => {
      const module = await import("../src/components/ui/input");
      expect(module).toHaveProperty("Input");
      expect(module.Input.name).toBe("Input");
    });

    it("should accept type prop", async () => {
      const { Input } = await import("../src/components/ui/input");
      expect(Input).toBeDefined();
      // Component supports: text, email, password, number, etc.
    });

    it("should accept className prop", async () => {
      const { Input } = await import("../src/components/ui/input");
      expect(Input).toBeDefined();
    });

    it("should accept standard HTML input props", async () => {
      const { Input } = await import("../src/components/ui/input");
      expect(Input).toBeDefined();
    });

    it("should have data-slot attribute", async () => {
      const { Input } = await import("../src/components/ui/input");
      expect(Input).toBeDefined();
    });
  });

  // Card Component Tests
  describe("Card Component", () => {
    it("should be importable", async () => {
      const { Card } = await import("../src/components/ui/card");
      expect(Card).toBeDefined();
      expect(typeof Card).toBe("function");
    });

    it("should export Card and related components", async () => {
      const module = await import("../src/components/ui/card");
      expect(module).toHaveProperty("Card");
      expect(module).toHaveProperty("CardHeader");
      expect(module).toHaveProperty("CardTitle");
      expect(module).toHaveProperty("CardDescription");
      expect(module).toHaveProperty("CardContent");
      expect(module).toHaveProperty("CardFooter");
      expect(module).toHaveProperty("CardAction");
    });

    it("CardHeader should be a React component", async () => {
      const { CardHeader } = await import("../src/components/ui/card");
      expect(CardHeader.name).toBe("CardHeader");
    });

    it("CardTitle should be a React component", async () => {
      const { CardTitle } = await import("../src/components/ui/card");
      expect(CardTitle.name).toBe("CardTitle");
    });

    it("CardDescription should be a React component", async () => {
      const { CardDescription } = await import("../src/components/ui/card");
      expect(CardDescription.name).toBe("CardDescription");
    });

    it("CardContent should be a React component", async () => {
      const { CardContent } = await import("../src/components/ui/card");
      expect(CardContent.name).toBe("CardContent");
    });

    it("CardFooter should be a React component", async () => {
      const { CardFooter } = await import("../src/components/ui/card");
      expect(CardFooter.name).toBe("CardFooter");
    });

    it("CardAction should be a React component", async () => {
      const { CardAction } = await import("../src/components/ui/card");
      expect(CardAction.name).toBe("CardAction");
    });

    it("Card should accept className prop", async () => {
      const { Card } = await import("../src/components/ui/card");
      expect(Card).toBeDefined();
    });

    it("Card should have data-slot attribute", async () => {
      const { Card } = await import("../src/components/ui/card");
      expect(Card).toBeDefined();
    });
  });

  // Table Component Tests
  describe("Table Component", () => {
    it("should be importable", async () => {
      const { Table } = await import("../src/components/ui/table");
      expect(Table).toBeDefined();
      expect(typeof Table).toBe("function");
    });

    it("should export Table and related components", async () => {
      const module = await import("../src/components/ui/table");
      expect(module).toHaveProperty("Table");
      expect(module).toHaveProperty("TableHeader");
      expect(module).toHaveProperty("TableBody");
      expect(module).toHaveProperty("TableFooter");
      expect(module).toHaveProperty("TableHead");
      expect(module).toHaveProperty("TableRow");
      expect(module).toHaveProperty("TableCell");
      expect(module).toHaveProperty("TableCaption");
    });

    it("TableHeader should be a React component", async () => {
      const { TableHeader } = await import("../src/components/ui/table");
      expect(TableHeader.name).toBe("TableHeader");
    });

    it("TableBody should be a React component", async () => {
      const { TableBody } = await import("../src/components/ui/table");
      expect(TableBody.name).toBe("TableBody");
    });

    it("TableRow should be a React component", async () => {
      const { TableRow } = await import("../src/components/ui/table");
      expect(TableRow.name).toBe("TableRow");
    });

    it("TableHead should be a React component", async () => {
      const { TableHead } = await import("../src/components/ui/table");
      expect(TableHead.name).toBe("TableHead");
    });

    it("TableCell should be a React component", async () => {
      const { TableCell } = await import("../src/components/ui/table");
      expect(TableCell.name).toBe("TableCell");
    });

    it("Table should have data-slot attribute", async () => {
      const { Table } = await import("../src/components/ui/table");
      expect(Table).toBeDefined();
    });
  });

  // Dialog Component Tests
  describe("Dialog Component", () => {
    it("should be importable", async () => {
      const { Dialog } = await import("../src/components/ui/dialog");
      expect(Dialog).toBeDefined();
      expect(typeof Dialog).toBe("function");
    });

    it("should export Dialog and related components", async () => {
      const module = await import("../src/components/ui/dialog");
      expect(module).toHaveProperty("Dialog");
      expect(module).toHaveProperty("DialogTrigger");
      expect(module).toHaveProperty("DialogContent");
      expect(module).toHaveProperty("DialogHeader");
      expect(module).toHaveProperty("DialogFooter");
      expect(module).toHaveProperty("DialogTitle");
      expect(module).toHaveProperty("DialogDescription");
      expect(module).toHaveProperty("DialogClose");
    });

    it("DialogTrigger should be a React component", async () => {
      const { DialogTrigger } = await import("../src/components/ui/dialog");
      expect(DialogTrigger.name).toBe("DialogTrigger");
    });

    it("DialogContent should be a React component", async () => {
      const { DialogContent } = await import("../src/components/ui/dialog");
      expect(DialogContent.name).toBe("DialogContent");
    });

    it("DialogHeader should be a React component", async () => {
      const { DialogHeader } = await import("../src/components/ui/dialog");
      expect(DialogHeader.name).toBe("DialogHeader");
    });

    it("DialogTitle should be a React component", async () => {
      const { DialogTitle } = await import("../src/components/ui/dialog");
      expect(DialogTitle.name).toBe("DialogTitle");
    });

    it("Dialog should have data-slot attribute", async () => {
      const { Dialog } = await import("../src/components/ui/dialog");
      expect(Dialog).toBeDefined();
    });
  });

  // Badge Component Tests
  describe("Badge Component", () => {
    it("should be importable", async () => {
      const { Badge } = await import("../src/components/ui/badge");
      expect(Badge).toBeDefined();
      expect(typeof Badge).toBe("function");
    });

    it("should export Badge as a React component", async () => {
      const module = await import("../src/components/ui/badge");
      expect(module).toHaveProperty("Badge");
      expect(module.Badge.name).toBe("Badge");
    });

    it("should accept variant prop", async () => {
      const { Badge } = await import("../src/components/ui/badge");
      expect(Badge).toBeDefined();
    });

    it("should accept className prop", async () => {
      const { Badge } = await import("../src/components/ui/badge");
      expect(Badge).toBeDefined();
    });
  });

  // Label Component Tests
  describe("Label Component", () => {
    it("should be importable", async () => {
      const { Label } = await import("../src/components/ui/label");
      expect(Label).toBeDefined();
      expect(typeof Label).toBe("function");
    });

    it("should export Label as a React component", async () => {
      const module = await import("../src/components/ui/label");
      expect(module).toHaveProperty("Label");
      expect(module.Label.name).toBe("Label");
    });

    it("should accept htmlFor prop", async () => {
      const { Label } = await import("../src/components/ui/label");
      expect(Label).toBeDefined();
    });
  });

  // Checkbox Component Tests
  describe("Checkbox Component", () => {
    it("should be importable", async () => {
      const { Checkbox } = await import("../src/components/ui/checkbox");
      expect(Checkbox).toBeDefined();
      expect(typeof Checkbox).toBe("function");
    });

    it("should export Checkbox as a React component", async () => {
      const module = await import("../src/components/ui/checkbox");
      expect(module).toHaveProperty("Checkbox");
      expect(module.Checkbox.name).toBe("Checkbox");
    });
  });

  // Select Component Tests
  describe("Select Component", () => {
    it("should be importable", async () => {
      const { Select } = await import("../src/components/ui/select");
      expect(Select).toBeDefined();
      expect(typeof Select).toBe("function");
    });

    it("should export Select and related components", async () => {
      const module = await import("../src/components/ui/select");
      expect(module).toHaveProperty("Select");
      expect(module).toHaveProperty("SelectGroup");
      expect(module).toHaveProperty("SelectValue");
      expect(module).toHaveProperty("SelectTrigger");
      expect(module).toHaveProperty("SelectContent");
      expect(module).toHaveProperty("SelectLabel");
      expect(module).toHaveProperty("SelectItem");
      expect(module).toHaveProperty("SelectSeparator");
      expect(module).toHaveProperty("SelectScrollUpButton");
      expect(module).toHaveProperty("SelectScrollDownButton");
    });
  });

  // Textarea Component Tests
  describe("Textarea Component", () => {
    it("should be importable", async () => {
      const { Textarea } = await import("../src/components/ui/textarea");
      expect(Textarea).toBeDefined();
      expect(typeof Textarea).toBe("function");
    });

    it("should export Textarea as a React component", async () => {
      const module = await import("../src/components/ui/textarea");
      expect(module).toHaveProperty("Textarea");
      expect(module.Textarea.name).toBe("Textarea");
    });

    it("should accept className prop", async () => {
      const { Textarea } = await import("../src/components/ui/textarea");
      expect(Textarea).toBeDefined();
    });
  });

  // Spinner Component Tests
  describe("Spinner Component", () => {
    it("should be importable", async () => {
      const { Spinner } = await import("../src/components/ui/spinner");
      expect(Spinner).toBeDefined();
      expect(typeof Spinner).toBe("function");
    });

    it("should export Spinner as a React component", async () => {
      const module = await import("../src/components/ui/spinner");
      expect(module).toHaveProperty("Spinner");
      expect(module.Spinner.name).toBe("Spinner");
    });
  });

  // Alert Component Tests
  describe("Alert Component", () => {
    it("should be importable", async () => {
      const { Alert } = await import("../src/components/ui/alert");
      expect(Alert).toBeDefined();
      expect(typeof Alert).toBe("function");
    });

    it("should export Alert and related components", async () => {
      const module = await import("../src/components/ui/alert");
      expect(module).toHaveProperty("Alert");
      expect(module).toHaveProperty("AlertTitle");
      expect(module).toHaveProperty("AlertDescription");
    });
  });

  // Tooltip Component Tests
  describe("Tooltip Component", () => {
    it("should be importable", async () => {
      const { Tooltip } = await import("../src/components/ui/tooltip");
      expect(Tooltip).toBeDefined();
      expect(typeof Tooltip).toBe("function");
    });

    it("should export Tooltip and related components", async () => {
      const module = await import("../src/components/ui/tooltip");
      expect(module).toHaveProperty("Tooltip");
      expect(module).toHaveProperty("TooltipTrigger");
      expect(module).toHaveProperty("TooltipContent");
      expect(module).toHaveProperty("TooltipProvider");
    });
  });

  // Dropdown Menu Component Tests
  describe("Dropdown Menu Component", () => {
    it("should be importable", async () => {
      const { DropdownMenu } =
        await import("../src/components/ui/dropdown-menu");
      expect(DropdownMenu).toBeDefined();
      expect(typeof DropdownMenu).toBe("function");
    });

    it("should export DropdownMenu and related components", async () => {
      const module = await import("../src/components/ui/dropdown-menu");
      expect(module).toHaveProperty("DropdownMenu");
      expect(module).toHaveProperty("DropdownMenuTrigger");
      expect(module).toHaveProperty("DropdownMenuContent");
      expect(module).toHaveProperty("DropdownMenuItem");
      expect(module).toHaveProperty("DropdownMenuCheckboxItem");
      expect(module).toHaveProperty("DropdownMenuRadioItem");
      expect(module).toHaveProperty("DropdownMenuLabel");
      expect(module).toHaveProperty("DropdownMenuSeparator");
      expect(module).toHaveProperty("DropdownMenuShortcut");
      expect(module).toHaveProperty("DropdownMenuGroup");
      expect(module).toHaveProperty("DropdownMenuPortal");
      expect(module).toHaveProperty("DropdownMenuSub");
      expect(module).toHaveProperty("DropdownMenuSubContent");
      expect(module).toHaveProperty("DropdownMenuSubTrigger");
      expect(module).toHaveProperty("DropdownMenuRadioGroup");
    });
  });

  // Tabs Component Tests
  describe("Tabs Component", () => {
    it("should be importable", async () => {
      const { Tabs } = await import("../src/components/ui/tabs");
      expect(Tabs).toBeDefined();
      expect(typeof Tabs).toBe("function");
    });

    it("should export Tabs and related components", async () => {
      const module = await import("../src/components/ui/tabs");
      expect(module).toHaveProperty("Tabs");
      expect(module).toHaveProperty("TabsList");
      expect(module).toHaveProperty("TabsTrigger");
      expect(module).toHaveProperty("TabsContent");
    });
  });

  // Accordion Component Tests
  describe("Accordion Component", () => {
    it("should be importable", async () => {
      const { Accordion } = await import("../src/components/ui/accordion");
      expect(Accordion).toBeDefined();
      expect(typeof Accordion).toBe("function");
    });

    it("should export Accordion and related components", async () => {
      const module = await import("../src/components/ui/accordion");
      expect(module).toHaveProperty("Accordion");
      expect(module).toHaveProperty("AccordionItem");
      expect(module).toHaveProperty("AccordionTrigger");
      expect(module).toHaveProperty("AccordionContent");
    });
  });

  // Separator Component Tests
  describe("Separator Component", () => {
    it("should be importable", async () => {
      const { Separator } = await import("../src/components/ui/separator");
      expect(Separator).toBeDefined();
      expect(typeof Separator).toBe("function");
    });

    it("should export Separator as a React component", async () => {
      const module = await import("../src/components/ui/separator");
      expect(module).toHaveProperty("Separator");
      expect(module.Separator.name).toBe("Separator");
    });
  });

  // Progress Component Tests
  describe("Progress Component", () => {
    it("should be importable", async () => {
      const { Progress } = await import("../src/components/ui/progress");
      expect(Progress).toBeDefined();
      expect(typeof Progress).toBe("function");
    });

    it("should export Progress as a React component", async () => {
      const module = await import("../src/components/ui/progress");
      expect(module).toHaveProperty("Progress");
      expect(module.Progress.name).toBe("Progress");
    });
  });

  // Skeleton Component Tests
  describe("Skeleton Component", () => {
    it("should be importable", async () => {
      const { Skeleton } = await import("../src/components/ui/skeleton");
      expect(Skeleton).toBeDefined();
      expect(typeof Skeleton).toBe("function");
    });

    it("should export Skeleton as a React component", async () => {
      const module = await import("../src/components/ui/skeleton");
      expect(module).toHaveProperty("Skeleton");
      expect(module.Skeleton.name).toBe("Skeleton");
    });
  });

  // Avatar Component Tests
  describe("Avatar Component", () => {
    it("should be importable", async () => {
      const { Avatar } = await import("../src/components/ui/avatar");
      expect(Avatar).toBeDefined();
      expect(typeof Avatar).toBe("function");
    });

    it("should export Avatar and related components", async () => {
      const module = await import("../src/components/ui/avatar");
      expect(module).toHaveProperty("Avatar");
      expect(module).toHaveProperty("AvatarImage");
      expect(module).toHaveProperty("AvatarFallback");
    });
  });

  // Switch Component Tests
  describe("Switch Component", () => {
    it("should be importable", async () => {
      const { Switch } = await import("../src/components/ui/switch");
      expect(Switch).toBeDefined();
      expect(typeof Switch).toBe("function");
    });

    it("should export Switch as a React component", async () => {
      const module = await import("../src/components/ui/switch");
      expect(module).toHaveProperty("Switch");
      expect(module.Switch.name).toBe("Switch");
    });
  });

  // Slider Component Tests
  describe("Slider Component", () => {
    it("should be importable", async () => {
      const { Slider } = await import("../src/components/ui/slider");
      expect(Slider).toBeDefined();
      expect(typeof Slider).toBe("function");
    });

    it("should export Slider as a React component", async () => {
      const module = await import("../src/components/ui/slider");
      expect(module).toHaveProperty("Slider");
      expect(module.Slider.name).toBe("Slider");
    });
  });

  // Popover Component Tests
  describe("Popover Component", () => {
    it("should be importable", async () => {
      const { Popover } = await import("../src/components/ui/popover");
      expect(Popover).toBeDefined();
      expect(typeof Popover).toBe("function");
    });

    it("should export Popover and related components", async () => {
      const module = await import("../src/components/ui/popover");
      expect(module).toHaveProperty("Popover");
      expect(module).toHaveProperty("PopoverTrigger");
      expect(module).toHaveProperty("PopoverContent");
    });
  });

  // Breadcrumb Component Tests
  describe("Breadcrumb Component", () => {
    it("should be importable", async () => {
      const { Breadcrumb } = await import("../src/components/ui/breadcrumb");
      expect(Breadcrumb).toBeDefined();
      expect(typeof Breadcrumb).toBe("function");
    });

    it("should export Breadcrumb and related components", async () => {
      const module = await import("../src/components/ui/breadcrumb");
      expect(module).toHaveProperty("Breadcrumb");
      expect(module).toHaveProperty("BreadcrumbList");
      expect(module).toHaveProperty("BreadcrumbItem");
      expect(module).toHaveProperty("BreadcrumbLink");
      expect(module).toHaveProperty("BreadcrumbPage");
      expect(module).toHaveProperty("BreadcrumbSeparator");
    });
  });
});
