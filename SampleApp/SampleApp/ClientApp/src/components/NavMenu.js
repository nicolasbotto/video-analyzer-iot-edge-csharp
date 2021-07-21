import React, { Component } from 'react';
import { Collapse, Container, Navbar, NavbarBrand, NavbarToggler, NavItem } from 'reactstrap';
import { Link, NavLink } from 'react-router-dom';
import './NavMenu.css';

export class NavMenu extends Component {
  static displayName = NavMenu.name;

  constructor (props) {
    super(props);

    this.toggleNavbar = this.toggleNavbar.bind(this);
    this.state = {
      collapsed: true
    };
  }

  toggleNavbar () {
    this.setState({
      collapsed: !this.state.collapsed
    });
  }

  render () {
    return (
      <header>
        <Navbar className="navbar-expand-sm navbar-toggleable-sm ng-white border-bottom box-shadow mb-3" light>
          <Container>
            <NavbarBrand tag={Link} to="/">Sample App</NavbarBrand>
            <NavbarToggler onClick={this.toggleNavbar} className="mr-2" />
            <Collapse className="d-sm-inline-flex flex-sm-row-reverse" isOpen={!this.state.collapsed} navbar>
              <ul className="navbar-nav flex-grow">
                    <NavItem>
                                <NavLink tag={Link} className="text-dark" activeClassName="active" to="/cloud">Cloud</NavLink>
                    </NavItem>
                </ul>&nbsp;
                <ul className="navbar-nav flex-grow">
                    <NavItem>
                                <NavLink exact={true} tag={Link} className="text-dark" activeClassName="active" to="/">Edge device</NavLink>
                    </NavItem>
                </ul>
            </Collapse>
          </Container>
        </Navbar>
      </header>
    );
  }
}
