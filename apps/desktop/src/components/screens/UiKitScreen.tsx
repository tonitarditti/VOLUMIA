import { useState } from "react";
import { Button, Card, Chip, Input, Select, Tabs } from "@/components/ui";

type PreviewTab = "first" | "second";

export function UiKitScreen() {
  const [tab, setTab] = useState<PreviewTab>("first");
  const [selectValue, setSelectValue] = useState("option-1");
  const [textValue, setTextValue] = useState("Sample text");

  return (
    <div className="screenWrap uiKitScreen">
      <Card className="screenHeader">
        <div>
          <h1>UI Kit</h1>
          <p>Internal visual checklist for component states.</p>
        </div>
      </Card>

      <div className="uiKitGrid">
        <Card className="settingsSection">
          <h3>Buttons</h3>
          <div className="uiKitRow">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
          </div>
        </Card>

        <Card className="settingsSection">
          <h3>Chips</h3>
          <div className="uiKitRow">
            <Chip>Default</Chip>
            <Chip active>Selected</Chip>
            <Chip disabled>Disabled</Chip>
          </div>
        </Card>

        <Card className="settingsSection">
          <h3>Tabs / Toggles</h3>
          <Tabs
            ariaLabel="UI kit tabs"
            value={tab}
            onChange={setTab}
            options={[
              { value: "first", label: "First" },
              { value: "second", label: "Second" },
            ]}
          />
        </Card>

        <Card className="settingsSection">
          <h3>Input / Select</h3>
          <div className="uiKitCol">
            <Input value={textValue} onChange={(event) => setTextValue(event.target.value)} />
            <Select value={selectValue} onChange={(event) => setSelectValue(event.target.value)}>
              <option value="option-1">Option 1</option>
              <option value="option-2">Option 2</option>
            </Select>
            <Input value="Disabled input" disabled readOnly />
          </div>
        </Card>
      </div>
    </div>
  );
}
