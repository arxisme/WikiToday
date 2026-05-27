export interface Subcategory {
	name: string;
	topics: string[];
}

export interface Category {
	name: string;
	icon: string;
	subcategories: Subcategory[];
}

export const categories: Category[] = [
	{
		name: 'Computer Science',
		icon: 'fas fa-laptop-code',
		subcategories: [
			{
				name: 'Foundations',
				topics: [
					'Algorithms',
					'Data Structures',
					'Computability Theory',
					'Information Theory',
					'Formal Languages',
					'Complexity Theory',
					'Turing Machine',
					'Automata Theory',
					'P versus NP problem',
					'Lambda Calculus',
					'Halting Problem',
					'Automata theory'
				]
			},
			{
				name: 'Systems',
				topics: [
					'Operating Systems',
					'Computer Architecture',
					'Parallel Computing',
					'Distributed Systems',
					'Embedded Systems',
					'Real-Time Systems',
					'Compilers',
					'Databases',
					'Virtual Memory',
					'Cache Coherence',
					'Garbage Collection (computer science)',
					'Kernel (operating system)',
					'File System',
					'Cloud Computing'
				]
			},
			{
				name: 'Artificial Intelligence',
				topics: [
					'Machine Learning',
					'Deep Learning',
					'Natural Language Processing',
					'Reinforcement Learning',
					'Computer Vision',
					'Knowledge Representation',
					'Multi-Agent Systems',
					'Generative Adversarial Network',
					'Transformer (deep learning architecture)',
					'Artificial Neural Network',
					'Genetic Algorithm',
					'Expert System',
					'Heuristic (computer science)'
				]
			},
			{
				name: 'Networking & Security',
				topics: [
					'Computer Networks',
					'Internet Protocols',
					'Cryptography',
					'Information Security',
					'Network Architecture',
					'Cyberwarfare',
					'Public-key Cryptography',
					'Intrusion Detection System',
					'Wireless Network'
				]
			},
			{
				name: 'Programming Languages',
				topics: [
					'Programming Language Design',
					'Functional Programming',
					'Type Systems',
					'Language Runtimes',
					'Software Engineering',
					'Object-Oriented Programming',
					'Domain-Specific Language',
					'Static Program Analysis'
				]
			}
		]
	},
	{
		name: 'Mathematics',
		icon: 'fas fa-square-root-variable',
		subcategories: [
			{
				name: 'Core Mathematics',
				topics: [
					'Linear Algebra',
					'Calculus',
					'Differential Equations',
					'Probability Theory',
					'Statistics',
					'Optimization',
					'Group Theory',
					'Set Theory',
					'Real Analysis',
					'Complex Analysis',
					'Fourier Analysis',
					'Measure Theory'
				]
			},
			{
				name: 'Advanced Mathematics',
				topics: [
					'Abstract Algebra',
					'Number Theory',
					'Topology',
					'Graph Theory',
					'Mathematical Logic',
					'Dynamical Systems',
					'Differential Geometry',
					'Chaos Theory',
					'Category Theory',
					'Algebraic Geometry',
					'Galois Theory',
					'Fractal'
				]
			},
			{
				name: 'Applied Mathematics',
				topics: [
					'Numerical Analysis',
					'Information Theory',
					'Control Theory',
					'Game Theory',
					'Operations Research',
					'Cryptography',
					'Mathematical Physics',
					'Mathematical Biology'
				]
			}
		]
	},
	{
		name: 'Physics',
		icon: 'fas fa-atom',
		subcategories: [
			{
				name: 'Classical Physics',
				topics: [
					'Classical Mechanics',
					'Electromagnetism',
					'Thermodynamics',
					'Optics',
					'Fluid Dynamics',
					'Analytical Mechanics',
					'Special Relativity',
					'Statistical Mechanics',
					'Acoustics',
					'Classical Field Theory'
				]
			},
			{
				name: 'Modern Physics',
				topics: [
					'Quantum Mechanics',
					'Relativity',
					'Statistical Mechanics',
					'Condensed Matter Physics',
					'General Relativity',
					'Quantum Decoherence',
					'Superconductivity',
					'Particle Physics',
					'Quantum Entanglement'
				]
			},
			{
				name: 'Fundamental Physics',
				topics: [
					'Particle Physics',
					'Quantum Field Theory',
					'Cosmology',
					'Astrophysics',
					'Nuclear Physics',
					'String Theory',
					'Standard Model',
					'Dark Matter',
					'Black Hole',
					'Loop Quantum Gravity',
					'Quantum Gravity'
				]
			},
			{
				name: 'Experimental Physics',
				topics: [
					'Accelerator Physics',
					'Detector Physics',
					'Plasma Physics',
					'Spectroscopy',
					'Cryogenics'
				]
			}
		]
	},
	{
		name: 'Interdisciplinary & Goldmines',
		icon: 'fas fa-compass',
		subcategories: [
			{
				name: 'Complex & Advanced Systems',
				topics: [
					'Computational Physics',
					'Quantum Computing',
					'Bioinformatics',
					'Complex Systems',
					'Systems Biology',
					'Computational Neuroscience',
					'Artificial Life',
					'Cybernetics',
					'Network Science',
					'Cognitive Science',
					'Scientific Computing',
					'Cellular Automaton',
					'Agent-Based Model',
					'Synergetics (Haken)'
				]
			},
			{
				name: 'History of Science',
				topics: [
					'History of Science & Computing',
					'History of Mathematics',
					'History of Physics',
					'History of Computing',
					'History of Artificial Intelligence',
					'Scientific Revolutions',
					'Age of Enlightenment'
				]
			},
			{
				name: 'Exploration & Discovery',
				topics: [
					'Space Exploration',
					'Famous Experiments',
					'Scientists and Inventors',
					'Scientific Instruments',
					'Mars Exploration',
					'History of Spaceflight'
				]
			}
		]
	}
];
