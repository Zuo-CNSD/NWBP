import clx from "classnames";

import MenuItem, { type MenuItemProps } from "../../components/menu/menu-item";

// 用泛型保留调用方传入的真实 item 类型，否则 renderItem 里的 item 会被
// 统一擦成 MenuItemProps，导致 SortableMenuItem / 右键菜单回调拿不到 id 等字段
interface Props<T extends MenuItemProps = MenuItemProps> {
  title?: React.ReactNode;
  titleExtra?: React.ReactNode;
  items: T[];
  collapsed?: boolean;
  className?: string;
  renderItem?: (item: T, index: number) => React.ReactNode;
}

const MenuGroup = <T extends MenuItemProps = MenuItemProps>({
  title,
  titleExtra,
  items,
  collapsed,
  className,
  renderItem,
}: Props<T>) => {
  return (
    <>
      {!collapsed && Boolean(title) && (
        <div className="text-default-500 flex items-center justify-between p-2 text-sm">
          <span>{title}</span>
          {titleExtra}
        </div>
      )}
      <div
        className={clx(
          "flex flex-col items-stretch",
          {
            "px-2": collapsed,
          },
          className,
        )}
      >
        {items.map((item, index) =>
          renderItem ? (
            renderItem(item, index)
          ) : (
            <MenuItem key={(item.id ?? item.href ?? item.title) as React.Key} {...item} collapsed={collapsed} />
          ),
        )}
      </div>
    </>
  );
};

export default MenuGroup;
