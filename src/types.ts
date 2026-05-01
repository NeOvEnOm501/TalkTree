export type NodeType = 'continue' | 'branch';

export interface IDrink {
  category: 'рюмка' | 'бутылка 0.5' | 'коктейль';
  name: string;
  amount: number;
}

export interface INode {
  id: string;
  text: string;
  parentId: string | null;
  type: NodeType;
  drinks: IDrink[]; // новый массив для алкоголя
}

export interface IScheme {
  id: string;
  title: string;
  nodes: INode[];
  createdAt: number;
}